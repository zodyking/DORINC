// Integration tests for admin approve/reject (P1-05) against the dev PostgreSQL.
import { config } from 'dotenv'
import { eq, like } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/node-postgres'
import { Pool } from 'pg'
import { afterAll, describe, expect, it } from 'vitest'
import { login, signup, verifyEmail } from '../../server/auth/auth.service'
import {
  approveUser,
  rejectUser,
  updateUser,
  UsersServiceError,
} from '../../server/services/users.service'
import { inviteStaffUser, setStaffPassword } from '../../server/services/staff-invite.service'
import { hardDeleteUser } from '../../server/services/hard-delete.service'
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
    await expect(login(db, pending.email, PASSWORD, { portal: 'staff' })).rejects.toThrow('NOT_APPROVED')

    const result = await approveUser(db, { userId: pending.id, approvedBy: FAKE_ADMIN_ID })
    expect(result.accountTypeKey).toBe('mechanic')
    expect(result.user.approvedAt).not.toBeNull()

    const session = await login(db, pending.email, PASSWORD, { portal: 'staff' })
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
    const session = await login(db, pending.email, PASSWORD, { portal: 'staff' })
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

    await expect(login(db, pending.email, PASSWORD, { portal: 'staff' })).rejects.toThrow(/DISABLED|NOT_APPROVED/)
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

  it('updateUser edits first/last name and email', async () => {
    const pending = await makeVerifiedPendingUser('profile')
    await approveUser(db, { userId: pending.id, approvedBy: FAKE_ADMIN_ID })

    const nextEmail = emailFor('profile-renamed')
    const result = await updateUser(db, {
      userId: pending.id,
      actor: { id: FAKE_ADMIN_ID, accountType: 'admin' },
      firstName: 'meliyah',
      lastName: 'king',
      email: nextEmail,
    })

    expect(result.changedFields).toEqual(expect.arrayContaining(['name', 'email']))
    expect(result.user.name).toBe('Meliyah King')
    expect(result.user.email).toBe(nextEmail)
    expect(result.user.emailVerifiedAt).toBeNull()
    expect(result.changedFields).toEqual(expect.arrayContaining(['emailVerifiedAt']))

    await expect(login(db, nextEmail, PASSWORD, { portal: 'staff' })).rejects.toThrow('NOT_VERIFIED')
  })

  it('updateUser rejects duplicate emails', async () => {
    const a = await makeVerifiedPendingUser('email-a')
    const b = await makeVerifiedPendingUser('email-b')
    await approveUser(db, { userId: a.id, approvedBy: FAKE_ADMIN_ID })
    await approveUser(db, { userId: b.id, approvedBy: FAKE_ADMIN_ID })

    await expect(updateUser(db, {
      userId: b.id,
      actor: { id: FAKE_ADMIN_ID, accountType: 'admin' },
      email: a.email,
    })).rejects.toThrow('EMAIL_TAKEN')
  })
})

describe('staff invite recreate + admin set password', () => {
  it('does not mark a recreated email as verified, and admin can set a password to sign in', async () => {
    const email = emailFor('recreate')
    const first = await inviteStaffUser(db, {
      name: 'Meliyah King',
      email,
      accountTypeKey: 'accountant',
      invitedBy: FAKE_ADMIN_ID,
    })
    expect(first.user.emailVerifiedAt).toBeNull()
    expect(first.user.approvedAt).not.toBeNull()

    await hardDeleteUser(db, first.user.id, FAKE_ADMIN_ID, 'recreate for testing')

    const second = await inviteStaffUser(db, {
      name: 'Meliyah King',
      email,
      accountTypeKey: 'accountant',
      invitedBy: FAKE_ADMIN_ID,
    })
    expect(second.user.id).not.toBe(first.user.id)
    expect(second.user.emailVerifiedAt).toBeNull()

    const [listed] = await db.select().from(users).where(eq(users.email, email))
    expect(listed?.emailVerifiedAt).toBeNull()

    await expect(login(db, email, 'not-the-invite-password', { portal: 'staff' }))
      .rejects.toThrow('INVALID_CREDENTIALS')

    await setStaffPassword(db, second.user.id, {
      password: 'admin-test-pass-1',
      mustChangePassword: false,
    })

    const session = await login(db, email, 'admin-test-pass-1', { portal: 'staff' })
    expect(session.accountTypeKey).toBe('accountant')

    const [verified] = await db.select().from(users).where(eq(users.id, second.user.id))
    expect(verified?.emailVerifiedAt).not.toBeNull()
    expect(verified?.mustChangePassword).toBe(false)
  })

  it('first login with a valid invite temp password verifies this identity', async () => {
    const email = emailFor('invite-login')
    const invited = await inviteStaffUser(db, {
      name: 'Invite Login',
      email,
      accountTypeKey: 'mechanic',
      invitedBy: FAKE_ADMIN_ID,
    })
    expect(invited.user.emailVerifiedAt).toBeNull()

    const { hashPassword } = await import('../../server/auth/password')
    await db.update(users)
      .set({ passwordHash: await hashPassword('invite-temp-ok1') })
      .where(eq(users.id, invited.user.id))

    await login(db, email, 'invite-temp-ok1', { portal: 'staff' })
    const [after] = await db.select().from(users).where(eq(users.id, invited.user.id))
    expect(after?.emailVerifiedAt).not.toBeNull()
  })
})
