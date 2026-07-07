import { and, eq, gt, isNull } from 'drizzle-orm'
import type { Db } from '../db/client'
import {
  accountTypes,
  emailVerificationTokens,
  permissions,
  sessions,
  userPermissionOverrides,
  users,
} from '../db/schema/auth'
import { hashPassword, verifyPassword } from './password'
import { generateToken, hashToken } from './tokens'
import type { AccountType, PermissionKey } from '../../shared/permissions/keys'
import type { PermissionOverrides, PermissionUser } from '../../shared/permissions/evaluate'

export const VERIFICATION_TOKEN_TTL_MS = 1000 * 60 * 60 * 24 // 24h
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
    | 'DISABLED'

export class AuthError extends Error {
  constructor(public readonly code: AuthServiceError) {
    super(code)
  }
}

/** Account types a public signup may request (mockup: Mechanic/Accountant/Viewer). */
export const SIGNUP_ACCOUNT_TYPES: AccountType[] = ['mechanic', 'accountant', 'viewer']

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

  const { token, tokenHash } = generateToken()
  await db.insert(emailVerificationTokens).values({
    userId: user!.id,
    tokenHash,
    expiresAt: new Date(Date.now() + VERIFICATION_TOKEN_TTL_MS),
  })

  return { user: user!, verificationToken: token }
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

export interface LoginResult {
  user: typeof users.$inferSelect
  accountTypeKey: AccountType
  sessionToken: string
  sessionExpiresAt: Date
}

export async function login(
  db: Db,
  email: string,
  password: string,
  meta: { ipAddress?: string | null, userAgent?: string | null } = {},
): Promise<LoginResult> {
  const [row] = await db
    .select({ user: users, accountTypeKey: accountTypes.key })
    .from(users)
    .innerJoin(accountTypes, eq(users.accountTypeId, accountTypes.id))
    .where(eq(users.email, email.trim().toLowerCase()))

  if (!row) throw new AuthError('INVALID_CREDENTIALS')

  const ok = await verifyPassword(row.user.passwordHash, password)
  if (!ok) throw new AuthError('INVALID_CREDENTIALS')

  if (!row.user.isActive) throw new AuthError('DISABLED')

  const isInternal = row.accountTypeKey !== 'customer'
  if (isInternal) {
    if (!row.user.emailVerifiedAt) throw new AuthError('NOT_VERIFIED')
    if (!row.user.approvedAt) throw new AuthError('NOT_APPROVED')
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
  user: PermissionUser & { name: string, email: string, customerId: string | null }
  overrides: PermissionOverrides
  sessionId: string
}

/** Resolve a session token into an auth context. Enforces inactivity + absolute expiry. */
export async function resolveSession(db: Db, sessionToken: string): Promise<ResolvedSession | null> {
  const now = new Date()
  const [row] = await db
    .select({ session: sessions, user: users, accountTypeKey: accountTypes.key })
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
      customerId: row.user.customerId,
    },
    overrides,
    sessionId: row.session.id,
  }
}
