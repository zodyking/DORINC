import { and, desc, eq, gt, isNull, ne } from 'drizzle-orm'
import type { Db } from '../db/client'
import { sessions, users } from '../db/schema/auth'
import { verifyPassword, hashPassword } from '../auth/password'
import { formatPersonName } from '../../shared/format/person-name'

export type AccountServiceError
  = | 'EMAIL_TAKEN'
    | 'INVALID_PASSWORD'
    | 'SESSION_NOT_FOUND'

export class AccountServiceError extends Error {
  constructor(public readonly code: AccountServiceError) {
    super(code)
  }
}

export interface AccountSessionRow {
  id: string
  userAgent: string | null
  ipAddress: string | null
  locationLabel: string | null
  lastActivityAt: string
  createdAt: string
  isCurrent: boolean
}

export interface AccountDetail {
  id: string
  name: string
  email: string
  accountType: string
  memberSince: string
  lastLoginAt: string | null
  activeSessionCount: number
  sessions: AccountSessionRow[]
  teamChatEnabled: boolean
  messageEmailNotify: boolean
}

export async function getAccountDetail(
  db: Db,
  userId: string,
  currentSessionId: string,
): Promise<AccountDetail | null> {
  const [user] = await db.select().from(users).where(eq(users.id, userId))
  if (!user) return null

  const now = new Date()
  const sessionRows = await db
    .select()
    .from(sessions)
    .where(and(
      eq(sessions.userId, userId),
      isNull(sessions.revokedAt),
      gt(sessions.expiresAt, now),
    ))
    .orderBy(desc(sessions.lastActivityAt))

  const mapped = sessionRows.map(s => ({
    id: s.id,
    userAgent: s.userAgent,
    ipAddress: s.ipAddress,
    locationLabel: s.locationLabel,
    lastActivityAt: s.lastActivityAt.toISOString(),
    createdAt: s.createdAt.toISOString(),
    isCurrent: s.id === currentSessionId,
  }))

  const lastLogin = mapped.find(s => s.isCurrent) ?? mapped[0]

  return {
    id: user.id,
    name: user.name,
    email: user.email,
    accountType: '', // filled by route from auth context
    memberSince: user.createdAt.toISOString(),
    lastLoginAt: lastLogin?.lastActivityAt ?? null,
    activeSessionCount: mapped.length,
    sessions: mapped,
    teamChatEnabled: user.teamChatEnabled,
    messageEmailNotify: user.messageEmailNotify,
  }
}

export async function updateAccountProfile(
  db: Db,
  userId: string,
  input: { firstName: string, lastName: string, email: string },
) {
  const email = input.email.trim().toLowerCase()
  const name = formatPersonName(input.firstName, input.lastName)
  const [existing] = await db
    .select({ id: users.id })
    .from(users)
    .where(and(eq(users.email, email), ne(users.id, userId)))

  if (existing) throw new AccountServiceError('EMAIL_TAKEN')

  const [user] = await db.update(users)
    .set({ name, email, updatedAt: new Date() })
    .where(eq(users.id, userId))
    .returning()

  return user!
}

export async function updateAccountNotificationPrefs(
  db: Db,
  userId: string,
  input: { teamChatEnabled?: boolean, messageEmailNotify?: boolean },
) {
  if (input.teamChatEnabled === undefined && input.messageEmailNotify === undefined) {
    const [user] = await db.select().from(users).where(eq(users.id, userId))
    if (!user) throw new AccountServiceError('SESSION_NOT_FOUND')
    return user
  }

  const changes: Partial<typeof users.$inferInsert> = { updatedAt: new Date() }
  if (input.teamChatEnabled !== undefined) changes.teamChatEnabled = input.teamChatEnabled
  if (input.messageEmailNotify !== undefined) changes.messageEmailNotify = input.messageEmailNotify

  const [user] = await db.update(users)
    .set(changes)
    .where(eq(users.id, userId))
    .returning()

  const { syncTeamChatParticipants } = await import('./team-chat.service')
  await syncTeamChatParticipants(db)

  return user!
}

export async function changeAccountPassword(
  db: Db,
  userId: string,
  currentPassword: string,
  newPassword: string,
) {
  const [user] = await db.select().from(users).where(eq(users.id, userId))
  if (!user) throw new AccountServiceError('INVALID_PASSWORD')

  const ok = await verifyPassword(user.passwordHash, currentPassword)
  if (!ok) throw new AccountServiceError('INVALID_PASSWORD')

  const passwordHash = await hashPassword(newPassword)
  const [updated] = await db.update(users)
    .set({
      passwordHash,
      mustChangePassword: false,
      tempPasswordExpiresAt: null,
      updatedAt: new Date(),
    })
    .where(eq(users.id, userId))
    .returning()

  return updated!
}

export async function revokeAccountSession(
  db: Db,
  userId: string,
  sessionId: string,
): Promise<boolean> {
  const [row] = await db.select().from(sessions)
    .where(and(eq(sessions.id, sessionId), eq(sessions.userId, userId), isNull(sessions.revokedAt)))
  if (!row) throw new AccountServiceError('SESSION_NOT_FOUND')

  await db.update(sessions).set({ revokedAt: new Date() }).where(eq(sessions.id, sessionId))
  return true
}

export async function revokeOtherAccountSessions(
  db: Db,
  userId: string,
  currentSessionId: string,
): Promise<number> {
  const now = new Date()
  const rows = await db.select({ id: sessions.id }).from(sessions)
    .where(and(
      eq(sessions.userId, userId),
      ne(sessions.id, currentSessionId),
      isNull(sessions.revokedAt),
      gt(sessions.expiresAt, now),
    ))

  for (const row of rows) {
    await db.update(sessions).set({ revokedAt: now }).where(eq(sessions.id, row.id))
  }
  return rows.length
}
