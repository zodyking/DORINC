/**
 * Repair Super Admin / customer portal email collision.
 *
 * Usage:
 *   REPAIR_STAFF_PASSWORD='your-new-password' npx tsx scripts/repair-staff-portal-collision.ts
 *   REPAIR_STAFF_PASSWORD='your-new-password' npx tsx scripts/repair-staff-portal-collision.ts --email zodykinginbox@gmail.com
 *   npx tsx scripts/repair-staff-portal-collision.ts --dry-run
 */
import { config } from 'dotenv'
import { drizzle } from 'drizzle-orm/node-postgres'
import pg from 'pg'
import { getDatabaseUrl } from '../server/services/runtime-config.service'
import {
  diagnoseStaffEmailCollisions,
  repairStaffEmailCollision,
} from '../server/services/staff-email-collision.service'

config()

const DEFAULT_STAFF_EMAIL = 'zodykinginbox@gmail.com'

function readArg(flag: string): string | undefined {
  const idx = process.argv.indexOf(flag)
  if (idx === -1) return undefined
  return process.argv[idx + 1]
}

const dryRun = process.argv.includes('--dry-run')
const staffEmail = readArg('--email') ?? DEFAULT_STAFF_EMAIL
const newPassword = process.env.REPAIR_STAFF_PASSWORD?.trim()

if (!dryRun && (!newPassword || newPassword.length < 12)) {
  console.error('[repair] Set REPAIR_STAFF_PASSWORD (min 12 chars) or pass --dry-run')
  process.exit(1)
}

const connectionString = getDatabaseUrl()
if (!connectionString) {
  console.error('[repair] Database not configured — set DATABASE_URL or complete /setup')
  process.exit(1)
}

const pool = new pg.Pool({ connectionString, max: 1 })
const db = drizzle({ client: pool })

try {
  const diagnosis = await diagnoseStaffEmailCollisions(db)
  console.log('[repair] diagnosis:', JSON.stringify(diagnosis, null, 2))

  const result = await repairStaffEmailCollision(db, {
    staffEmail,
    newPassword: newPassword ?? 'dry-run-placeholder1',
    dryRun,
  })

  console.log('[repair] result:', JSON.stringify(result, null, 2))

  if (dryRun) {
    console.log('[repair] dry run only — no changes applied')
  }
  else {
    console.log(`[repair] Super Admin restored for ${result.restoredEmail}`)
    console.log('[repair] Sign in on the staff portal with the new password from REPAIR_STAFF_PASSWORD')
    if (result.recreatedPortalCustomers.length) {
      console.log('[repair] Recreated portal users for customers:', result.recreatedPortalCustomers.join(', '))
      console.log('[repair] Resend portal credentials from each customer page if needed')
    }
  }
}
finally {
  await pool.end()
}
