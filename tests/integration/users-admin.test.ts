// Integration tests for admin approve/reject (P1-05) against the dev PostgreSQL.
import { config } from 'dotenv'
import { like } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/node-postgres'
import { Pool } from 'pg'
import { afterAll, describe, expect, it } from 'vitest'
import { login, signup, verifyEmail } from '../../server/auth/auth.service'
import { approveUser, rejectUser, UsersServiceError } from '../../server/services/users.service'
import { users } from '../../server/db/schema/auth'
import { ACCOUNT_TYPE_BUNDLES } from '../../shared/permissions/keys'

config()

const pool = new Pool({ connectionString: process.env.DATABASE_URL })
const db = drizzle({ client: pool })

const stamp = Date.now()
const emailFor = (tag: string) => `useradmintest-${stamp}-${tag}@test.dorinc.local`
const PASSWORD = 'a-long-password-123'
const FAKE_ADMIN_ID = '00000000-0000-0000-0000-000000000000'

async function makeVerifiedPendingUser(tag: string) {
  const { user, verificationToken } = await signup(db, {
    name: `Pending ${tag}`,
    email: emailFor(tag),
    password: PASSWORD,
    requestedAccountType: 'mechanic',
  })
  await verifyEmail(db, verificationToken)
  return user
}

afterAll(async () => {
  await db.delete(users).where(like(users.email, `useradmintest-${stamp}-%`))
  await pool.end()
})

describe('P1-05 admin approve/reject', () => {
  it('only admin-level account types carry users.manage.all', () => {
    const withManage = Object.entries(ACCOUNT_TYPE_BUNDLES)
      .filter(([, bundle]) => bundle.includes('users.manage.all'))
      .map(([type]) => type)
    expect(withManage.sort()).toEqual(['admin', 'super_admin'])
  })

  it('approve grants the requested account type and enables login', async () => {
    const pending = await makeVerifiedPendingUser('approve')
    await expect(login(db, pending.email, PASSWORD)).rejects.toThrow('NOT_APPROVED')

    const result = await approveUser(db, { userId: pending.id, approvedBy: FAKE_ADMIN_ID })
    expect(result.accountTypeKey).toBe('mechanic')
    expect(result.user.approvedAt).not.toBeNull()

    const session = await login(db, pending.email, PASSWORD)
    expect(session.accountTypeKey).toBe('mechanic')
  })

  it('approve can assign a different account type', async () => {
    const pending = await makeVerifiedPendingUser('retype')
    const result = await approveUser(db, {
      userId: pending.id,
      approvedBy: FAKE_ADMIN_ID,
      accountTypeKey: 'accountant',
    })
    expect(result.accountTypeKey).toBe('accountant')
    const session = await login(db, pending.email, PASSWORD)
    expect(session.accountTypeKey).toBe('accountant')
  })

  it('approve refuses customer and super_admin assignment', async () => {
    const pending = await makeVerifiedPendingUser('badtype')
    await expect(
      approveUser(db, { userId: pending.id, approvedBy: FAKE_ADMIN_ID, accountTypeKey: 'customer' }),
    ).rejects.toThrow('INVALID_ACCOUNT_TYPE')
    await expect(
      approveUser(db, { userId: pending.id, approvedBy: FAKE_ADMIN_ID, accountTypeKey: 'super_admin' }),
    ).rejects.toThrow('INVALID_ACCOUNT_TYPE')
  })

  it('rejected users cannot login', async () => {
    const pending = await makeVerifiedPendingUser('reject')
    const result = await rejectUser(db, {
      userId: pending.id,
      rejectedBy: FAKE_ADMIN_ID,
      reason: 'Unknown applicant',
    })
    expect(result.user.rejectedAt).not.toBeNull()
    expect(result.user.isActive).toBe(false)

    await expect(login(db, pending.email, PASSWORD)).rejects.toThrow(/DISABLED|NOT_APPROVED/)
  })

  it('approve/reject require a pending user', async () => {
    const pending = await makeVerifiedPendingUser('guards')
    await approveUser(db, { userId: pending.id, approvedBy: FAKE_ADMIN_ID })

    await expect(approveUser(db, { userId: pending.id, approvedBy: FAKE_ADMIN_ID }))
      .rejects.toThrow('NOT_PENDING')
    await expect(rejectUser(db, { userId: pending.id, rejectedBy: FAKE_ADMIN_ID, reason: 'x' }))
      .rejects.toThrow('NOT_PENDING')

    await expect(approveUser(db, { userId: FAKE_ADMIN_ID, approvedBy: FAKE_ADMIN_ID }))
      .rejects.toThrow(UsersServiceError)
  })
})
