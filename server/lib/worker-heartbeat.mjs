/** Persist worker liveness in app_settings for Control Panel health tiles. */

/**
 * @param {import('pg').Pool} pool
 * @param {'pdf' | 'general'} kind
 */
export async function touchWorkerHeartbeat(pool, kind) {
  const key = `worker.${kind}.heartbeat`
  const value = JSON.stringify({ at: new Date().toISOString() })
  await pool.query(
    `INSERT INTO app_settings (key, value, updated_at)
     VALUES ($1, $2::jsonb, now())
     ON CONFLICT (key) DO UPDATE
       SET value = EXCLUDED.value, updated_at = now()`,
    [key, value],
  )
}
