import { and, eq, gt, isNull } from 'drizzle-orm'
import type { Db } from '../db/client'
import {
  accountTypePermissions,
  accountTypes,
  emailVerificationTokens,
  passwordResetTokens,
  permissions,
  sessions,
  userPermissionOverrides,
  users,
} from '../db/schema/auth'
import { customers } from '../db/schema/customers'
import { hashPassword, verifyPassword } from './password'
import { generateToken, hashToken } from './tokens'
import type { AccountType, PermissionKey } from '../../shared/permissions/keys'
import type { PermissionOverrides, PermissionUser } from '../../shared/permissions/evaluate'

export const VERIFICATION_TOKEN_TTL_MS = 1000 * 60 * 60 * 24 // 24h
export const PASSWORD_RESET_TOKEN_TTL_MS = 1000 * 60 * 60 // 1h
export const SESSION_ABSOLUTE_TTL_MS = 1000 * 60 * 60 * 24 * 7 // 7 days
export const SESSION_INACTIVITY_TTL_MS = 1000 * 60 * 60 // 60 min

export type AuthServiceError
  = | 'EMAIL_TAKEN'
    | 'INVALID_ACCOUNT_TYPE'
    | 'INVALID_TOKEN'
    | 'TOKEN_EXPIRED'
    | 'INVALID_CREDENTIALS'
    | 'NOT_VERIFIED'
    | 'NOT_APPROVED'
    | 'ALREADY_VERIFIED'
    | 'DISABLED'
    | 'PORTAL_NOT_LINKED'
    | 'PORTAL_DISABLED'
    | 'TEMP_PASSWORD_EXPIRED'
    | 'WRONG_PORTAL'

export type LoginPortal = 'customer' | 'staff'

export class AuthError extends Error {
  constructor(public readonly code: AuthServiceError) {
    super(code)
  }
}

/** Account types a public signup may request (mockup: Mechanic/Accountant/Viewer). */
export const SIGNUP_ACCOUNT_TYPES: AccountType[] = ['mechanic', 'accountant']

export interface SignupInput {
  name: string
  email: string
  password: string
  requestedAccountType: AccountType
}

export async function signup(db: Db, input: SignupInput) {
  if (!SIGNUP_ACCOUNT_TYPES.includes(input.requestedAccountType)) {
    throw new AuthError('INVALID_ACCOUNT_TYPE')
  }

  const email = input.email.trim().toLowerCase()

  const [existing] = await db.select({ id: users.id }).from(users).where(eq(users.email, email))
  if (existing) throw new AuthError('EMAIL_TAKEN')

  const [typeRow] = await db.select().from(accountTypes)
    .where(eq(accountTypes.key, input.requestedAccountType))
  if (!typeRow) throw new AuthError('INVALID_ACCOUNT_TYPE')

  const passwordHash = await hashPassword(input.password)

  const [user] = await db.insert(users).values({
    name: input.name.trim(),
    email,
    passwordHash,
    accountTypeId: typeRow.id,
    // Pending state: not verified, not approved
  }).returning()

  const verificationToken = await issueVerificationToken(db, user!.id)

  return { user: user!, verificationToken }
}

/** Invalidate prior unused tokens and mint a fresh verification link. */
export async function issueVerificationToken(db: Db, userId: string): Promise<string> {
  await db.update(emailVerificationTokens)
    .set({ usedAt: new Date() })
    .where(and(
      eq(emailVerificationTokens.userId, userId),
      isNull(emailVerificationTokens.usedAt),
    ))

  const { token, tokenHash } = generateToken()
  await db.insert(emailVerificationTokens).values({
    userId,
    tokenHash,
    expiresAt: new Date(Date.now() + VERIFICATION_TOKEN_TTL_MS),
  })
  return token
}

export async function resendVerificationEmail(db: Db, email: string, password: string) {
  const normalized = email.trim().toLowerCase()

  const [row] = await db
    .select({ user: users, accountTypeKey: accountTypes.key })
    .from(users)
    .innerJoin(accountTypes, eq(users.accountTypeId, accountTypes.id))
    .where(eq(users.email, normalized))

  if (!row) throw new AuthError('INVALID_CREDENTIALS')

  const ok = await verifyPassword(row.user.passwordHash, password)
  if (!ok) throw new AuthError('INVALID_CREDENTIALS')

  if (row.accountTypeKey === 'customer') throw new AuthError('INVALID_ACCOUNT_TYPE')
  if (!row.user.isActive) throw new AuthError('DISABLED')
  if (row.user.rejectedAt) throw new AuthError('NOT_APPROVED')
  if (row.user.emailVerifiedAt) throw new AuthError('ALREADY_VERIFIED')

  const verificationToken = await issueVerificationToken(db, row.user.id)
  return { user: row.user, verificationToken }
}

export async function verifyEmail(db: Db, token: string) {
  const tokenHash = hashToken(token)
  const [row] = await db.select().from(emailVerificationTokens)
    .where(and(eq(emailVerificationTokens.tokenHash, tokenHash), isNull(emailVerificationTokens.usedAt)))
  if (!row) throw new AuthError('INVALID_TOKEN')
  if (row.expiresAt.getTime() < Date.now()) throw new AuthError('TOKEN_EXPIRED')

  await db.update(emailVerificationTokens)
    .set({ usedAt: new Date() })
    .where(eq(emailVerificationTokens.id, row.id))

  const [user] = await db.update(users)
    .set({ emailVerifiedAt: new Date(), updatedAt: new Date() })
    .where(eq(users.id, row.userId))
    .returning()

  return user!
}

/** Invalidate prior unused tokens and mint a fresh password reset link. */
export async function issuePasswordResetToken(db: Db, userId: string): Promise<string> {
  await db.update(passwordResetTokens)
    .set({ usedAt: new Date() })
    .where(and(
      eq(passwordResetTokens.userId, userId),
      isNull(passwordResetTokens.usedAt),
    ))

  const { token, tokenHash } = generateToken()
  await db.insert(passwordResetTokens).values({
    userId,
    tokenHash,
    expiresAt: new Date(Date.now() + PASSWORD_RESET_TOKEN_TTL_MS),
  })
  return token
}

/**
 * Request a staff password reset email. Returns null when no email should be sent
 * (unknown email, customer account, disabled, etc.) without revealing which case applied.
 */
export async function requestPasswordReset(db: Db, email: string) {
  const normalized = email.trim().toLowerCase()

  const [row] = await db
    .select({ user: users, accountTypeKey: accountTypes.key })
    .from(users)
    .innerJoin(accountTypes, eq(users.accountTypeId, accountTypes.id))
    .where(eq(users.email, normalized))

  if (!row) return null
  if (row.accountTypeKey === 'customer') return null
  if (!row.user.isActive) return null
  if (row.user.rejectedAt) return null
  if (!row.user.emailVerifiedAt) return null

  const resetToken = await issuePasswordResetToken(db, row.user.id)
  return { user: row.user, resetToken }
}

export async function resetPasswordWithToken(db: Db, token: string, newPassword: string) {
  const tokenHash = hashToken(token)
  const [row] = await db.select().from(passwordResetTokens)
    .where(and(eq(passwordResetTokens.tokenHash, tokenHash), isNull(passwordResetTokens.usedAt)))
  if (!row) throw new AuthError('INVALID_TOKEN')
  if (row.expiresAt.getTime() < Date.now()) throw new AuthError('TOKEN_EXPIRED')

  await db.update(passwordResetTokens)
    .set({ usedAt: new Date() })
    .where(eq(passwordResetTokens.id, row.id))

  const passwordHash = await hashPassword(newPassword)

  const [user] = await db.update(users)
    .set({
      passwordHash,
      mustChangePassword: false,
      tempPasswordExpiresAt: null,
      updatedAt: new Date(),
    })
    .where(eq(users.id, row.userId))
    .returning()

  await db.update(sessions)
    .set({ revokedAt: new Date() })
    .where(and(eq(sessions.userId, row.userId), isNull(sessions.revokedAt)))

  return user!
}

export interface LoginResult {
  user: typeof users.$inferSelect
  accountTypeKey: AccountType
  sessionToken: string
  sessionExpiresAt: Date
}

export interface LoginGeoMeta {
  latitude: number
  longitude: number
  accuracyM?: number | null
  locationLabel?: string | null
}

export async function login(
  db: Db,
  identifier: string,
  password: string,
  meta: {
    ipAddress?: string | null
    userAgent?: string | null
    portal?: LoginPortal
    geo?: LoginGeoMeta | null
    locationLabel?: string | null
  } = {},
): Promise<LoginResult> {
  const portal = meta.portal ?? 'staff'
  const trimmed = identifier.trim()

  const [row] = portal === 'customer'
    ? await db
      .select({ user: users, accountTypeKey: accountTypes.key })
      .from(users)
      .innerJoin(accountTypes, eq(users.accountTypeId, accountTypes.id))
      .where(eq(users.username, trimmed.toLowerCase()))
    : await db
      .select({ user: users, accountTypeKey: accountTypes.key })
      .from(users)
      .innerJoin(accountTypes, eq(users.accountTypeId, accountTypes.id))
      .where(eq(users.email, trimmed.toLowerCase()))

  if (!row) throw new AuthError('INVALID_CREDENTIALS')

  const ok = await verifyPassword(row.user.passwordHash, password)
  if (!ok) throw new AuthError('INVALID_CREDENTIALS')

  if (!row.user.isActive) throw new AuthError('DISABLED')
  if (row.user.rejectedAt) throw new AuthError('NOT_APPROVED')

  const isCustomer = row.accountTypeKey === 'customer'
  if (isCustomer) {
    if (!row.user.customerId) throw new AuthError('PORTAL_NOT_LINKED')
    const [customer] = await db.select({ portalEnabled: customers.portalEnabled, archivedAt: customers.archivedAt })
      .from(customers)
      .where(eq(customers.id, row.user.customerId))
    if (!customer || customer.archivedAt || !customer.portalEnabled) {
      throw new AuthError('PORTAL_DISABLED')
    }
    if (
      row.user.tempPasswordExpiresAt
      && row.user.tempPasswordExpiresAt.getTime() < Date.now()
    ) {
      throw new AuthError('TEMP_PASSWORD_EXPIRED')
    }
  }
  else {
    if (!row.user.emailVerifiedAt) throw new AuthError('NOT_VERIFIED')
    if (!row.user.approvedAt) throw new AuthError('NOT_APPROVED')
  }

  if (meta.portal === 'customer' && !isCustomer) {
    throw new AuthError('WRONG_PORTAL')
  }
  if (meta.portal === 'staff' && isCustomer) {
    throw new AuthError('WRONG_PORTAL')
  }

  // Session rotation: revoke any live sessions, then issue a fresh token
  await db.update(sessions)
    .set({ revokedAt: new Date() })
    .where(and(eq(sessions.userId, row.user.id), isNull(sessions.revokedAt)))

  const { token, tokenHash } = generateToken()
  const expiresAt = new Date(Date.now() + SESSION_ABSOLUTE_TTL_MS)

  await db.insert(sessions).values({
    userId: row.user.id,
    tokenHash,
    expiresAt,
    ipAddress: meta.ipAddress ?? null,
    userAgent: meta.userAgent ?? null,
    geoLatitude: meta.geo?.latitude ?? null,
    geoLongitude: meta.geo?.longitude ?? null,
    geoAccuracyM: meta.geo?.accuracyM ?? null,
    locationLabel: meta.locationLabel ?? meta.geo?.locationLabel ?? null,
  })

  return {
    user: row.user,
    accountTypeKey: row.accountTypeKey as AccountType,
    sessionToken: token,
    sessionExpiresAt: expiresAt,
  }
}

export async function logout(db: Db, sessionToken: string): Promise<void> {
  await db.update(sessions)
    .set({ revokedAt: new Date() })
    .where(eq(sessions.tokenHash, hashToken(sessionToken)))
}

export interface ResolvedSession {
  user: PermissionUser & {
    name: string
    email: string
    username: string | null
    customerId: string | null
    mustChangePassword: boolean
  }
  roleGrants: PermissionKey[]
  overrides: PermissionOverrides
  sessionId: string
  stepUpVerifiedAt: Date | null
}

/** Resolve a session token into an auth context. Enforces inactivity + absolute expiry. */
export async function resolveSession(db: Db, sessionToken: string): Promise<ResolvedSession | null> {
  const now = new Date()
  const [row] = await db
    .select({ session: sessions, user: users, accountTypeKey: accountTypes.key, accountTypeId: accountTypes.id })
    .from(sessions)
    .innerJoin(users, eq(sessions.userId, users.id))
    .innerJoin(accountTypes, eq(users.accountTypeId, accountTypes.id))
    .where(and(
      eq(sessions.tokenHash, hashToken(sessionToken)),
      isNull(sessions.revokedAt),
      gt(sessions.expiresAt, now),
    ))

  if (!row) return null

  // Inactivity timeout
  if (now.getTime() - row.session.lastActivityAt.getTime() > SESSION_INACTIVITY_TTL_MS) {
    await db.update(sessions).set({ revokedAt: now }).where(eq(sessions.id, row.session.id))
    return null
  }

  await db.update(sessions).set({ lastActivityAt: now }).where(eq(sessions.id, row.session.id))

  // Load role grants from DB (accountTypePermissions)
  const roleGrantRows = await db
    .select({ key: permissions.key })
    .from(accountTypePermissions)
    .innerJoin(permissions, eq(accountTypePermissions.permissionId, permissions.id))
    .where(eq(accountTypePermissions.accountTypeId, row.accountTypeId))

  const roleGrants = roleGrantRows.map(r => r.key as PermissionKey)

  // Load user-level overrides
  const overrideRows = await db
    .select({ effect: userPermissionOverrides.effect, key: permissions.key })
    .from(userPermissionOverrides)
    .innerJoin(permissions, eq(userPermissionOverrides.permissionId, permissions.id))
    .where(eq(userPermissionOverrides.userId, row.user.id))

  const overrides: PermissionOverrides = { allow: [], deny: [] }
  for (const o of overrideRows) {
    overrides[o.effect as 'allow' | 'deny'].push(o.key as PermissionKey)
  }

  return {
    user: {
      id: row.user.id,
      accountType: row.accountTypeKey as AccountType,
      isActive: row.user.isActive,
      emailVerifiedAt: row.user.emailVerifiedAt,
      approvedAt: row.user.approvedAt,
      name: row.user.name,
      email: row.user.email,
      username: row.user.username,
      customerId: row.user.customerId,
      mustChangePassword: row.user.mustChangePassword,
    },
    roleGrants,
    overrides,
    sessionId: row.session.id,
    stepUpVerifiedAt: row.session.stepUpVerifiedAt,
  }
}
