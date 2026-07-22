// Integration test: deleting a user who is referenced by security alerts.
// Regression for the FK block that surfaced as "Could not delete user".
import { config } from 'dotenv'
import { eq, like } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/node-postgres'
import { Pool } from 'pg'
import { afterAll, describe, expect, it } from 'vitest'
import { signup, verifyEmail } from '../../server/auth/auth.service'
import { users } from '../../server/db/schema/auth'
import { suspiciousActivityAlerts } from '../../server/db/schema/security'
import { hardDeleteUser } from '../../server/services/hard-delete.service'
import { createSuspiciousActivityAlert } from '../../server/services/suspicious-activity.service'

config()

const pool = new Pool({ connectionString: process.env.DATABASE_URL })
const db = drizzle({ client: pool })

const stamp = Date.now()
const emailFor = (tag: string) => `harddelete-${stamp}-${tag}@test.dorinc.local`

afterAll(async () => {
  await db.delete(suspiciousActivityAlerts).where(eq(suspiciousActivityAlerts.ruleKey, `test-${stamp}`))
  await db.delete(users).where(like(users.email, `harddelete-${stamp}-%`))
  await pool.end()
})

async function makeUser(tag: string) {
  const { user, verificationToken } = await signup(db, {
    name: `Hard Delete ${tag}`,
    email: emailFor(tag),
    password: 'a-long-password-123',
    requestedAccountType: 'accountant',
  })
  await verifyEmail(db, verificationToken)
  await db.update(users).set({ approvedAt: new Date() }).where(eq(users.id, user.id))
  return user
}

describe('hardDeleteUser with security alert references', () => {
  it('deletes a user who is the actor and dismisser of a suspicious activity alert', async () => {
    const admin = await makeUser('admin')
    const target = await makeUser('target')

    const alert = await createSuspiciousActivityAlert(db, {
      ruleKey: `test-${stamp}`,
      title: 'Test alert',
      description: 'Alert referencing the target user',
      actorUserId: target.id,
    })
    await db.update(suspiciousActivityAlerts)
      .set({ status: 'dismissed', dismissedAt: new Date(), dismissedBy: target.id })
      .where(eq(suspiciousActivityAlerts.id, alert.id))

    const result = await hardDeleteUser(db, target.id, admin.id, 'cleanup')
    expect(result.id).toBe(target.id)

    const [gone] = await db.select({ id: users.id }).from(users).where(eq(users.id, target.id))
    expect(gone).toBeUndefined()

    // Alert history is preserved but detached from the deleted user.
    const [detached] = await db.select({
      actorUserId: suspiciousActivityAlerts.actorUserId,
      dismissedBy: suspiciousActivityAlerts.dismissedBy,
    })
      .from(suspiciousActivityAlerts)
      .where(eq(suspiciousActivityAlerts.id, alert.id))
    expect(detached?.actorUserId).toBeNull()
    expect(detached?.dismissedBy).toBeNull()
  })
})
