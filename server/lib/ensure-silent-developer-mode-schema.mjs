// Idempotent repair for users.silent_developer_mode.
// Migration 0058 existed on disk but was never journaled; 0077 fixes that for
// new deploys. This runs on every boot so a missed migration cannot break login.

const SILENT_DEVELOPER_MODE_SQL = `
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "silent_developer_mode" boolean DEFAULT false NOT NULL;
`.trim()

/**
 * Ensure users.silent_developer_mode exists. Safe to run on every boot.
 *
 * @param {import('pg').Pool} pool
 * @returns {Promise<boolean>} true when the column was added
 */
export async function ensureSilentDeveloperModeSchema(pool) {
  const { rows } = await pool.query(`
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'users'
      AND column_name = 'silent_developer_mode'
    LIMIT 1
  `)
  if (rows.length > 0) return false

  await pool.query(SILENT_DEVELOPER_MODE_SQL)
  console.log('[migrate] ensured users.silent_developer_mode column')
  return true
}
