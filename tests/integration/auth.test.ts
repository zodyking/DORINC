// Integration tests for signup / verification / login / session lifecycle
// against the real dev PostgreSQL (P1-02, P1-03).
import { config } from 'dotenv'
import { eq, like } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/node-postgres'
import { Pool } from 'pg'
import { afterAll, describe, expect, it } from 'vitest'
import {
  AuthError,
  login,
  logout,
  requestPasswordReset,
  resetPasswordWithToken,
  resendVerificationEmail,
  resolveSession,
  signup,
  verifyEmail,
} from '../../server/auth/auth.service'
import { accountTypes, emailVerificationTokens, passwordResetTokens, sessions, users } from '../../server/db/schema/auth'

config()

const pool = new Pool({ connectionString: process.env.DATABASE_URL })
const db = drizzle({ client: pool })

const stamp = Date.now()
const emailFor = (tag: string) => `authtest-${stamp}-${tag}@test.dorinc.local`

afterAll(async () => {
  await db.delete(users).where(like(users.email, `authtest-${stamp}-%`))
  await pool.end()
})

describe('P1-02 signup + email verification', () => {
  it('signup creates a pending user and a verification token', async () => {
    const { user, verificationToken } = await signup(db, {
      name: 'Test Mechanic',
      email: emailFor('signup'),
      password: 'a-long-password-123',
      requestedAccountType: 'mechanic',
    })

    expect(user.emailVerifiedAt).toBeNull()
    expect(user.approvedAt).toBeNull()
    expect(verificationToken.length).toBeGreaterThan(20)
  })

  it('rejects duplicate emails', async () => {
    const email = emailFor('dup')
    await signup(db, { name: 'A', email, password: 'a-long-password-123', requestedAccountType: 'accountant' })
    await expect(
      signup(db, { name: 'B', email, password: 'a-long-password-123', requestedAccountType: 'accountant' }),
    ).rejects.toThrow('EMAIL_TAKEN')
  })

  it('verifies email with a valid token and rejects reuse', async () => {
    const { user, verificationToken } = await signup(db, {
      name: 'Verify Me',
      email: emailFor('verify'),
      password: 'a-long-password-123',
      requestedAccountType: 'accountant',
    })

    const verified = await verifyEmail(db, verificationToken)
    expect(verified.id).toBe(user.id)
    expect(verified.emailVerifiedAt).not.toBeNull()

    await expect(verifyEmail(db, verificationToken)).rejects.toThrow('INVALID_TOKEN')
  })

  it('resends verification email for unverified staff users', async () => {
    const email = emailFor('resend')
    const password = 'a-long-password-123'
    const { user, verificationToken: firstToken } = await signup(db, {
      name: 'Resend Me',
      email,
      password,
      requestedAccountType: 'accountant',
    })

    const { verificationToken: secondToken } = await resendVerificationEmail(db, email, password)
    expect(secondToken).not.toBe(firstToken)
    expect(secondToken.length).toBeGreaterThan(20)

    await verifyEmail(db, secondToken)
    const [updated] = await db.select().from(users).where(eq(users.id, user.id))
    expect(updated?.emailVerifiedAt).not.toBeNull()

    await expect(resendVerificationEmail(db, email, password)).rejects.toThrow('ALREADY_VERIFIED')
  })

  it('rejects expired tokens', async () => {
    const { user, verificationToken } = await signup(db, {
      name: 'Expired',
      email: emailFor('expired'),
      password: 'a-long-password-123',
      requestedAccountType: 'accountant',
    })

    await db.update(emailVerificationTokens)
      .set({ expiresAt: new Date(Date.now() - 1000) })
      .where(eq(emailVerificationTokens.userId, user.id))

    await expect(verifyEmail(db, verificationToken)).rejects.toThrow('TOKEN_EXPIRED')
  })
})

describe('P1-02 password reset', () => {
  async function makeApprovedUser(tag: string) {
    const email = emailFor(tag)
    const { user, verificationToken } = await signup(db, {
      name: `User ${tag}`,
      email,
      password: 'a-long-password-123',
      requestedAccountType: 'accountant',
    })
    await verifyEmail(db, verificationToken)
    await db.update(users).set({ approvedAt: new Date() }).where(eq(users.id, user.id))
    return { email, userId: user.id, password: 'a-long-password-123' }
  }

  it('sends a reset token for verified staff users and resets password', async () => {
    const { email, userId, password } = await makeApprovedUser('reset')

    const result = await requestPasswordReset(db, email)
    expect(result?.resetToken.length).toBeGreaterThan(20)

    await resetPasswordWithToken(db, result!.resetToken, 'new-password-456789')
    await expect(login(db, email, password, { portal: 'staff' })).rejects.toThrow('INVALID_CREDENTIALS')

    const session = await login(db, email, 'new-password-456789', { portal: 'staff' })
    expect(session.user.id).toBe(userId)
  })

  it('returns null for unknown emails without revealing absence', async () => {
    const result = await requestPasswordReset(db, emailFor('missing-reset'))
    expect(result).toBeNull()
  })

  it('rejects expired reset tokens', async () => {
    const { email } = await makeApprovedUser('reset-expired')
    const { resetToken } = (await requestPasswordReset(db, email))!

    await db.update(passwordResetTokens)
      .set({ expiresAt: new Date(Date.now() - 1000) })
      .where(eq(passwordResetTokens.userId, (await db.select({ id: users.id }).from(users).where(eq(users.email, email)))[0]!.id))

    await expect(resetPasswordWithToken(db, resetToken, 'new-password-456789')).rejects.toThrow('TOKEN_EXPIRED')
  })

  it('rejects reset token reuse', async () => {
    const { email } = await makeApprovedUser('reset-reuse')
    const { resetToken } = (await requestPasswordReset(db, email))!

    await resetPasswordWithToken(db, resetToken, 'new-password-456789')
    await expect(resetPasswordWithToken(db, resetToken, 'another-password-789012')).rejects.toThrow('INVALID_TOKEN')
  })
})

describe('P1-03 login + session lifecycle', () => {
  async function makeApprovedUser(tag: string) {
    const email = emailFor(tag)
    const { user, verificationToken } = await signup(db, {
      name: `User ${tag}`,
      email,
      password: 'a-long-password-123',
      requestedAccountType: 'accountant',
    })
    await verifyEmail(db, verificationToken)
    await db.update(users).set({ approvedAt: new Date() }).where(eq(users.id, user.id))
    return { email, userId: user.id }
  }

  it('blocks unverified and unapproved users', async () => {
    const email = emailFor('gates')
    const { verificationToken } = await signup(db, {
      name: 'Gated',
      email,
      password: 'a-long-password-123',
      requestedAccountType: 'accountant',
    })

    await expect(login(db, email, 'a-long-password-123', { portal: 'staff' })).rejects.toThrow('NOT_VERIFIED')
    await verifyEmail(db, verificationToken)
    await expect(login(db, email, 'a-long-password-123', { portal: 'staff' })).rejects.toThrow('NOT_APPROVED')
  })

  it('logs in, resolves the session, rotates on re-login, revokes on logout', async () => {
    const { email, userId } = await makeApprovedUser('session')

    await expect(login(db, email, 'wrong-password', { portal: 'staff' })).rejects.toThrow('INVALID_CREDENTIALS')

    const first = await login(db, email, 'a-long-password-123', { portal: 'staff' })
    const resolved = await resolveSession(db, first.sessionToken)
    expect(resolved?.user.id).toBe(userId)
    expect(resolved?.user.accountType).toBe('accountant')

    // Rotation: a second login revokes the first session
    const second = await login(db, email, 'a-long-password-123', { portal: 'staff' })
    expect(await resolveSession(db, first.sessionToken)).toBeNull()
    expect(await resolveSession(db, second.sessionToken)).not.toBeNull()

    await logout(db, second.sessionToken)
    expect(await resolveSession(db, second.sessionToken)).toBeNull()
  })

  it('expires sessions after inactivity', async () => {
    const { email } = await makeApprovedUser('idle')
    const { sessionToken } = await login(db, email, 'a-long-password-123', { portal: 'staff' })

    // Simulate 2h idle
    await db.update(sessions)
      .set({ lastActivityAt: new Date(Date.now() - 2 * 60 * 60 * 1000) })
      .where(eq(sessions.tokenHash, (await import('../../server/auth/tokens')).hashToken(sessionToken)))

    expect(await resolveSession(db, sessionToken)).toBeNull()
  })

  it('blocks disabled users', async () => {
    const { email, userId } = await makeApprovedUser('disabled')
    await db.update(users).set({ isActive: false, disabledAt: new Date() }).where(eq(users.id, userId))
    await expect(login(db, email, 'a-long-password-123', { portal: 'staff' })).rejects.toThrow(AuthError)
  })

  it('re-enables and signs in a disabled super admin', async () => {
    const { email, userId } = await makeApprovedUser('superadmin-disabled')
    const [superType] = await db.select({ id: accountTypes.id })
      .from(accountTypes)
      .where(eq(accountTypes.key, 'super_admin'))
    await db.update(users)
      .set({
        accountTypeId: superType!.id,
        isActive: false,
        disabledAt: new Date(),
        disabledReason: 'accidental lockout',
      })
      .where(eq(users.id, userId))

    const session = await login(db, email, 'a-long-password-123', { portal: 'staff' })
    expect(session.user.id).toBe(userId)
    expect(session.accountTypeKey).toBe('super_admin')

    const [restored] = await db.select().from(users).where(eq(users.id, userId))
    expect(restored?.isActive).toBe(true)
    expect(restored?.disabledAt).toBeNull()
    expect(restored?.disabledReason).toBeNull()
  })

  it('rejects staff login via customer portal and customer via staff portal', async () => {
    const { email } = await makeApprovedUser('portal-split-staff')
    await expect(
      login(db, email, 'a-long-password-123', { portal: 'customer' }),
    ).rejects.toThrow('WRONG_PORTAL')
  })
})
