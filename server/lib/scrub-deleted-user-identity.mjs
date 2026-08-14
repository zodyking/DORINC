/**
 * One-time-safe boot scrub for users who were hard-deleted before identity
 * wipe existed. Keeps invoices / messages / service logs. Removes leftover
 * access-gate, outside-geo, and QR-upload presence for user ids that no
 * longer exist. Shared phones (another living user on the same device id)
 * are left alone.
 *
 * @param {import('pg').Pool} pool
 */
export async function scrubDeletedUserIdentity(pool) {
  const has = async (name) => {
    const { rows } = await pool.query(`SELECT to_regclass($1) AS reg`, [`public.${name}`])
    return Boolean(rows[0]?.reg)
  }

  const hasAccess = await has('access_events')
  const hasGeo = await has('outside_geo_challenges')
  const hasUploads = await has('service_log_upload_sessions')
  if (!hasAccess && !hasGeo && !hasUploads) return

  const client = await pool.connect()
  try {
    await client.query('BEGIN')

    await client.query(`
      CREATE TEMP TABLE orphan_deleted_user_devices (
        device_id text PRIMARY KEY
      ) ON COMMIT DROP
    `)
    await client.query(`
      CREATE TEMP TABLE orphan_deleted_user_emails (
        user_email text PRIMARY KEY
      ) ON COMMIT DROP
    `)

    if (hasAccess) {
      await client.query(`
        INSERT INTO orphan_deleted_user_devices (device_id)
        SELECT DISTINCT lower(btrim(device_id))
        FROM access_events
        WHERE device_id IS NOT NULL
          AND btrim(device_id) <> ''
          AND user_id IS NOT NULL
          AND NOT EXISTS (SELECT 1 FROM users u WHERE u.id = access_events.user_id)
        ON CONFLICT DO NOTHING
      `)
      await client.query(`
        INSERT INTO orphan_deleted_user_emails (user_email)
        SELECT DISTINCT lower(btrim(user_email))
        FROM access_events
        WHERE user_email IS NOT NULL
          AND btrim(user_email) <> ''
          AND user_id IS NOT NULL
          AND NOT EXISTS (SELECT 1 FROM users u WHERE u.id = access_events.user_id)
        ON CONFLICT DO NOTHING
      `)
    }

    if (hasGeo) {
      await client.query(`
        INSERT INTO orphan_deleted_user_devices (device_id)
        SELECT DISTINCT lower(btrim(device_id))
        FROM outside_geo_challenges
        WHERE device_id IS NOT NULL
          AND btrim(device_id) <> ''
          AND NOT EXISTS (SELECT 1 FROM users u WHERE u.id = outside_geo_challenges.user_id)
        ON CONFLICT DO NOTHING
      `)
      await client.query(`
        INSERT INTO orphan_deleted_user_emails (user_email)
        SELECT DISTINCT lower(btrim(user_email))
        FROM outside_geo_challenges
        WHERE user_email IS NOT NULL
          AND btrim(user_email) <> ''
          AND NOT EXISTS (SELECT 1 FROM users u WHERE u.id = outside_geo_challenges.user_id)
        ON CONFLICT DO NOTHING
      `)
    }

    if (hasAccess) {
      await client.query(`
        DELETE FROM access_events ae
        WHERE ae.user_id IS NOT NULL
          AND NOT EXISTS (SELECT 1 FROM users u WHERE u.id = ae.user_id)
      `)
      await client.query(`
        DELETE FROM access_events ae
        WHERE ae.user_email IS NOT NULL
          AND lower(btrim(ae.user_email)) IN (SELECT user_email FROM orphan_deleted_user_emails)
          AND NOT EXISTS (
            SELECT 1 FROM users u WHERE lower(u.email) = lower(btrim(ae.user_email))
          )
      `)
      await client.query(`
        DELETE FROM access_events ae
        WHERE ae.device_id IS NOT NULL
          AND lower(btrim(ae.device_id)) IN (SELECT device_id FROM orphan_deleted_user_devices)
          AND NOT EXISTS (
            SELECT 1 FROM sessions s
            WHERE s.device_id IS NOT NULL
              AND lower(btrim(s.device_id)) = lower(btrim(ae.device_id))
          )
          AND NOT EXISTS (
            SELECT 1 FROM access_events living
            WHERE living.device_id IS NOT NULL
              AND lower(btrim(living.device_id)) = lower(btrim(ae.device_id))
              AND living.user_id IS NOT NULL
              AND EXISTS (SELECT 1 FROM users u WHERE u.id = living.user_id)
          )
      `)
    }

    if (hasGeo) {
      await client.query(`
        DELETE FROM outside_geo_challenges og
        WHERE NOT EXISTS (SELECT 1 FROM users u WHERE u.id = og.user_id)
      `)
      await client.query(`
        DELETE FROM outside_geo_challenges og
        WHERE og.device_id IS NOT NULL
          AND lower(btrim(og.device_id)) IN (SELECT device_id FROM orphan_deleted_user_devices)
          AND NOT EXISTS (
            SELECT 1 FROM sessions s
            WHERE s.device_id IS NOT NULL
              AND lower(btrim(s.device_id)) = lower(btrim(og.device_id))
          )
      `)
    }

    if (hasUploads) {
      await client.query(`
        DELETE FROM service_log_upload_sessions s
        WHERE NOT EXISTS (SELECT 1 FROM users u WHERE u.id = s.created_by)
           OR NOT EXISTS (SELECT 1 FROM users u WHERE u.id = s.technician_id)
      `)
    }

    await client.query('COMMIT')
  }
  catch (err) {
    try { await client.query('ROLLBACK') }
    catch { /* ignore rollback failure */ }
    throw err
  }
  finally {
    client.release()
  }
}
