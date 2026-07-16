// Idempotent repair for IMAP/email thread tables when Drizzle migrate did not apply 0047.
import { access, readFile } from 'node:fs/promises'
import { join } from 'node:path'

async function resolveMigrationsFolder() {
  const candidates = [
    join(process.cwd(), 'server/db/migrations'),
    join(process.cwd(), '.output/server/db/migrations'),
    join(process.cwd(), '.data/db-migrations'),
  ]

  for (const folder of candidates) {
    try {
      await access(join(folder, '0047_email_inbox.sql'))
      return folder
    }
    catch {
      // try next
    }
  }

  throw new Error('0047_email_inbox.sql not found in server/db/migrations')
}

/**
 * Apply 0047_email_inbox.sql when email inbox tables are missing.
 * Safe to run after Drizzle migrate on every boot.
 *
 * @param {import('pg').Pool} pool
 * @returns {Promise<boolean>} true when repair SQL was applied
 */
export async function ensureEmailInboxSchema(pool) {
  const { rows } = await pool.query(`SELECT to_regclass('public.email_threads') AS reg`)
  if (rows[0]?.reg) return false

  const folder = await resolveMigrationsFolder()
  const sql = await readFile(join(folder, '0047_email_inbox.sql'), 'utf8')
  await pool.query(sql)
  console.log('[migrate] repaired missing email inbox tables from 0047_email_inbox.sql')
  return true
}
