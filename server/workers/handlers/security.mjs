// Security maintenance + IP geolocation backfill.
//
// The request path never waits on a geolocation provider: page loads record the
// visit immediately and this worker fills in the coordinates afterwards, which
// is what makes every event show up on the security map without adding latency
// to the site. It also expires time-limited bans and enforces event retention.

const DEFAULT_RETENTION_DAYS = 90
const BACKFILL_BATCH = 25
const BACKFILL_MAX_AGE_HOURS = 72
/** The worker ticks every couple of seconds; geolocation providers do not need
 *  to hear from us that often. */
const BACKFILL_INTERVAL_MS = 30_000

let lastBackfillAt = 0

/**
 * @param {import('pg').Pool} pool
 * @returns {Promise<{ enabled: boolean, retentionDays: number }>}
 */
async function readSecurityPolicy(pool) {
  const { rows } = await pool.query(
    `SELECT value FROM app_settings WHERE key = 'security.policy' LIMIT 1`,
  )
  const value = rows[0]?.value ?? {}
  const retentionDays = Number(value.retentionDays)
  return {
    enabled: value.enabled === true,
    retentionDays: Number.isFinite(retentionDays) && retentionDays > 0
      ? retentionDays
      : DEFAULT_RETENTION_DAYS,
  }
}

/**
 * Resolve coordinates for recently captured events that do not have any yet.
 *
 * @param {import('pg').Pool} pool
 * @param {number} [batch]
 */
export async function runSecurityGeoBackfill(pool, batch = BACKFILL_BATCH) {
  if (Date.now() - lastBackfillAt < BACKFILL_INTERVAL_MS) return { resolved: 0, unresolved: 0 }
  lastBackfillAt = Date.now()

  const { rows } = await pool.query(
    `SELECT DISTINCT host(ip_address) AS ip
     FROM access_events
     WHERE ip_address IS NOT NULL
       AND latitude IS NULL
       AND device_latitude IS NULL
       AND created_at >= now() - ($1 || ' hours')::interval
     LIMIT $2`,
    [String(BACKFILL_MAX_AGE_HOURS), batch],
  )
  if (!rows.length) return { resolved: 0, unresolved: 0 }

  const { lookupIpGeo } = await import('../../lib/ip-geo-lookup.mjs')

  let resolved = 0
  let unresolved = 0

  for (const row of rows) {
    const ip = row.ip
    if (!ip) continue

    let geo
    try {
      geo = await lookupIpGeo(ip)
    }
    catch {
      geo = null
    }

    if (!geo || geo.latitude == null || geo.longitude == null) {
      // Mark the attempt so a permanently unresolvable address (private range,
      // provider gap) is not retried on every single tick.
      await pool.query(
        `UPDATE access_events
         SET geo_source = 'none'
         WHERE host(ip_address) = $1 AND latitude IS NULL AND created_at >= now() - ($2 || ' hours')::interval`,
        [ip, String(BACKFILL_MAX_AGE_HOURS)],
      )
      unresolved++
      continue
    }

    await pool.query(
      `UPDATE access_events
       SET latitude = $2,
           longitude = $3,
           ip_latitude = $2,
           ip_longitude = $3,
           geo_source = CASE WHEN device_latitude IS NULL THEN 'ip' ELSE geo_source END,
           location_label = COALESCE(location_label, $4),
           city = COALESCE(city, $5),
           region = COALESCE(region, $6),
           postal_code = COALESCE(postal_code, $7),
           country = COALESCE(country, $8),
           timezone = COALESCE(timezone, $9)
       WHERE host(ip_address) = $1
         AND latitude IS NULL
         AND created_at >= now() - ($10 || ' hours')::interval`,
      [
        ip,
        geo.latitude,
        geo.longitude,
        geo.label,
        geo.city,
        geo.regionCode ?? geo.region,
        geo.postalCode,
        geo.country,
        geo.timezone,
        String(BACKFILL_MAX_AGE_HOURS),
      ],
    )

    // Keep the ban list readable: an entry created from an IP we had not
    // located yet picks up its location here.
    await pool.query(
      `UPDATE ip_bans
       SET last_location_label = COALESCE(last_location_label, $2),
           last_country = COALESCE(last_country, $3),
           last_latitude = COALESCE(last_latitude, $4),
           last_longitude = COALESCE(last_longitude, $5)
       WHERE ip_address IS NOT NULL AND host(ip_address) = $1`,
      [ip, geo.label, geo.country, geo.latitude, geo.longitude],
    )

    resolved++
  }

  return { resolved, unresolved }
}

/**
 * @param {import('pg').Pool} pool
 */
async function runSecurityMaintenance(pool) {
  const policy = await readSecurityPolicy(pool)

  const { rowCount: expired } = await pool.query(
    `UPDATE ip_bans
     SET status = 'expired', updated_at = now()
     WHERE status = 'active' AND expires_at IS NOT NULL AND expires_at <= now()`,
  )

  const { rowCount: pruned } = await pool.query(
    `DELETE FROM access_events WHERE created_at < now() - ($1 || ' days')::interval`,
    [String(policy.retentionDays)],
  )

  return { expired: expired ?? 0, pruned: pruned ?? 0, retentionDays: policy.retentionDays }
}

/**
 * @param {import('pg').Pool} pool
 */
export async function maybeEnqueueSecurityMaintenance(pool) {
  const startOfDay = new Date()
  startOfDay.setUTCHours(0, 0, 0, 0)

  const { rows: existing } = await pool.query(
    `SELECT id FROM worker_jobs
     WHERE job_type = 'security_maintenance' AND created_at >= $1
     LIMIT 1`,
    [startOfDay],
  )
  if (existing[0]) return false

  await pool.query(
    `INSERT INTO worker_jobs (job_type, payload, status, attempts, max_attempts, run_after)
     VALUES ('security_maintenance', $1, 'queued', 0, 3, now())`,
    [JSON.stringify({ trigger: 'scheduled' })],
  )
  return true
}

/**
 * @param {import('pg').Pool} pool
 * @param {number} [batch]
 */
export async function processSecurityMaintenanceJobs(pool, batch = 1) {
  let processed = 0
  let failed = 0

  for (let i = 0; i < batch; i++) {
    const client = await pool.connect()
    let job
    try {
      await client.query('BEGIN')
      const { rows } = await client.query(
        `SELECT id, payload, attempts, max_attempts FROM worker_jobs
         WHERE job_type = 'security_maintenance' AND status = 'queued' AND run_after <= now()
         ORDER BY created_at
         LIMIT 1
         FOR UPDATE SKIP LOCKED`,
      )
      job = rows[0]
      if (job) {
        await client.query(
          `UPDATE worker_jobs SET status = 'processing', attempts = attempts + 1, started_at = now() WHERE id = $1`,
          [job.id],
        )
      }
      await client.query('COMMIT')
    }
    catch (err) {
      await client.query('ROLLBACK').catch(() => {})
      throw err
    }
    finally {
      client.release()
    }

    if (!job) break

    try {
      const result = await runSecurityMaintenance(pool)
      await pool.query(
        `UPDATE worker_jobs SET status = 'done', finished_at = now(), last_error = NULL WHERE id = $1`,
        [job.id],
      )
      processed++
      if (result.expired || result.pruned) {
        console.log(`[worker] security_maintenance expired=${result.expired} pruned=${result.pruned} retention=${result.retentionDays}d`)
      }
    }
    catch (err) {
      failed++
      const message = err instanceof Error ? err.message : String(err)
      const attempts = job.attempts + 1
      if (attempts >= job.max_attempts) {
        await pool.query(
          `UPDATE worker_jobs SET status = 'failed', finished_at = now(), last_error = $2 WHERE id = $1`,
          [job.id, message],
        )
      }
      else {
        const backoffSec = Math.min(300, 30 * attempts)
        await pool.query(
          `UPDATE worker_jobs SET status = 'queued', last_error = $2,
           run_after = now() + ($3 || ' seconds')::interval WHERE id = $1`,
          [job.id, message, String(backoffSec)],
        )
      }
    }
  }

  return { processed, failed }
}
