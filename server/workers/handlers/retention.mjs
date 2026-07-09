// backup_retention_prune — prune expired backup_runs per retention policy (P3-11).

function isoWeekKey(date) {
  const d = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()))
  const day = d.getUTCDay() || 7
  d.setUTCDate(d.getUTCDate() + 4 - day)
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1))
  const week = Math.ceil((((d.getTime() - yearStart.getTime()) / 86400000) + 1) / 7)
  return `${d.getUTCFullYear()}-W${String(week).padStart(2, '0')}`
}

function monthKey(date) {
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`
}

function selectBackupsToKeep(runs, policy, now = new Date()) {
  const keep = new Set()
  const sorted = [...runs].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())

  const dailyCutoff = new Date(now)
  dailyCutoff.setUTCDate(dailyCutoff.getUTCDate() - policy.retention_daily)

  const weeklyCutoff = new Date(now)
  weeklyCutoff.setUTCDate(weeklyCutoff.getUTCDate() - policy.retention_weekly * 7)

  const monthlyCutoff = new Date(now)
  monthlyCutoff.setUTCMonth(monthlyCutoff.getUTCMonth() - policy.retention_monthly)

  const weeklyKept = new Set()
  const monthlyKept = new Set()

  for (const run of sorted) {
    const at = new Date(run.created_at)
    if (at >= dailyCutoff) {
      keep.add(run.id)
      continue
    }
    if (at >= weeklyCutoff) {
      const key = isoWeekKey(at)
      if (!weeklyKept.has(key)) {
        weeklyKept.add(key)
        keep.add(run.id)
      }
      continue
    }
    if (at >= monthlyCutoff) {
      const key = monthKey(at)
      if (!monthlyKept.has(key)) {
        monthlyKept.add(key)
        keep.add(run.id)
      }
    }
  }

  return keep
}

async function pruneExpiredBackups(pool) {
  const { rows: settingsRows } = await pool.query(`SELECT id, retention_daily, retention_weekly, retention_monthly FROM backup_settings LIMIT 1`)
  const settings = settingsRows[0]
  if (!settings) return { pruned: 0, kept: 0 }

  const { rows: runs } = await pool.query(
    `SELECT id, filename, created_at FROM backup_runs WHERE status = 'completed' ORDER BY created_at DESC`,
  )
  if (!runs.length) return { pruned: 0, kept: 0 }

  const keep = selectBackupsToKeep(runs, settings)
  const toDelete = runs.filter(r => !keep.has(r.id))
  if (!toDelete.length) return { pruned: 0, kept: keep.size }

  const ids = toDelete.map(r => r.id)
  await pool.query(`DELETE FROM backup_runs WHERE id = ANY($1::uuid[])`, [ids])

  await pool.query(
    `INSERT INTO audit_logs (entity_type, entity_id, action, after_data, permission_key, risk_level, created_at)
     VALUES ('backup', $1, 'backup.retention_pruned', $2, 'backups.manage.all', 'sensitive', now())`,
    [
      settings.id,
      JSON.stringify({
        pruned: toDelete.length,
        kept: keep.size,
        policy: {
          retentionDaily: settings.retention_daily,
          retentionWeekly: settings.retention_weekly,
          retentionMonthly: settings.retention_monthly,
        },
        filenames: toDelete.map(r => r.filename),
      }),
    ],
  )

  return { pruned: toDelete.length, kept: keep.size }
}

/**
 * @param {import('pg').Pool} pool
 */
export async function maybeEnqueueRetentionPrune(pool) {
  const startOfDay = new Date()
  startOfDay.setUTCHours(0, 0, 0, 0)

  const { rows: existing } = await pool.query(
    `SELECT id FROM worker_jobs
     WHERE job_type = 'backup_retention_prune' AND created_at >= $1
     LIMIT 1`,
    [startOfDay],
  )
  if (existing[0]) return false

  await pool.query(
    `INSERT INTO worker_jobs (job_type, payload, status, attempts, max_attempts, run_after)
     VALUES ('backup_retention_prune', $1, 'queued', 0, 3, now())`,
    [JSON.stringify({ trigger: 'scheduled' })],
  )
  return true
}

/**
 * @param {import('pg').Pool} pool
 * @param {number} [batch]
 */
export async function processRetentionPruneJobs(pool, batch = 1) {
  let processed = 0
  let failed = 0

  for (let i = 0; i < batch; i++) {
    const client = await pool.connect()
    let job
    try {
      await client.query('BEGIN')
      const { rows } = await client.query(
        `SELECT id, payload, attempts, max_attempts FROM worker_jobs
         WHERE job_type = 'backup_retention_prune' AND status = 'queued' AND run_after <= now()
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
      const result = await pruneExpiredBackups(pool)
      await pool.query(
        `UPDATE worker_jobs SET status = 'done', finished_at = now(), last_error = NULL WHERE id = $1`,
        [job.id],
      )
      processed++
      if (result.pruned) {
        console.log(`[worker] backup_retention_prune pruned=${result.pruned} kept=${result.kept}`)
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
