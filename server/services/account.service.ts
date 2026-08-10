import { and, desc, eq, gt, isNull, ne } from 'drizzle-orm'
import type { Db } from '../db/client'
import { sessions, users } from '../db/schema/auth'
import { verifyPassword, hashPassword } from '../auth/password'
import { formatPersonName } from '../../shared/format/person-name'

export type AccountServiceError
  = | 'EMAIL_TAKEN'
    | 'INVALID_PASSWORD'
    | 'SESSION_NOT_FOUND'
    | 'PHONE_REQUIRED'

export class AccountServiceError extends Error {
  constructor(public readonly code: AccountServiceError) {
    super(code)
  }
}

export interface AccountSessionRow {
  id: string
  userAgent: string | null
  deviceId: string | null
  ipAddress: string | null
  locationLabel: string | null
  lastActivityAt: string
  createdAt: string
  isCurrent: boolean
}

export interface AccountKnownDeviceRow {
  /** Stable key: first-party device_id when present, else user-agent fallback. */
  key: string
  deviceId: string | null
  userAgent: string | null
  ipAddress: string | null
  locationLabel: string | null
  firstSeenAt: string
  lastSeenAt: string
  sessionCount: number
  isActive: boolean
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
  knownDevices: AccountKnownDeviceRow[]
  teamChatEnabled: boolean
  messageEmailNotify: boolean
  phone: string | null
  messageNotifyChannel: 'email' | 'sms'
  silentDeveloperMode: boolean
  quoSmsEnabled: boolean
}

function deviceKey(deviceId: string | null | undefined, userAgent: string | null | undefined): string {
  const id = deviceId?.trim().toLowerCase()
  if (id) return `id:${id}`
  const ua = userAgent?.trim()
  return ua ? `ua:${ua}` : 'unknown'
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
    deviceId: s.deviceId,
    ipAddress: s.ipAddress,
    locationLabel: s.locationLabel,
    lastActivityAt: s.lastActivityAt.toISOString(),
    createdAt: s.createdAt.toISOString(),
    isCurrent: s.id === currentSessionId,
  }))

  // Historical sessions (including revoked/expired) define the user's known devices.
  const historyRows = await db
    .select({
      id: sessions.id,
      userAgent: sessions.userAgent,
      deviceId: sessions.deviceId,
      ipAddress: sessions.ipAddress,
      locationLabel: sessions.locationLabel,
      lastActivityAt: sessions.lastActivityAt,
      createdAt: sessions.createdAt,
      revokedAt: sessions.revokedAt,
      expiresAt: sessions.expiresAt,
    })
    .from(sessions)
    .where(eq(sessions.userId, userId))
    .orderBy(desc(sessions.lastActivityAt))
    .limit(500)

  const deviceMap = new Map<string, AccountKnownDeviceRow>()
  for (const row of historyRows) {
    const key = deviceKey(row.deviceId, row.userAgent)
    const lastSeenAt = row.lastActivityAt.toISOString()
    const createdAt = row.createdAt.toISOString()
    const isLive = row.revokedAt == null && row.expiresAt > now
    const isCurrent = row.id === currentSessionId
    const existing = deviceMap.get(key)
    if (!existing) {
      deviceMap.set(key, {
        key,
        deviceId: row.deviceId,
        userAgent: row.userAgent,
        ipAddress: row.ipAddress,
        locationLabel: row.locationLabel,
        firstSeenAt: createdAt,
        lastSeenAt,
        sessionCount: 1,
        isActive: isLive,
        isCurrent,
      })
      continue
    }
    existing.sessionCount += 1
    if (isLive) existing.isActive = true
    if (isCurrent) existing.isCurrent = true
    if (!existing.deviceId && row.deviceId) existing.deviceId = row.deviceId
    if (row.createdAt.getTime() < new Date(existing.firstSeenAt).getTime()) {
      existing.firstSeenAt = createdAt
    }
    // historyRows are newest-first; first write already holds the latest lastSeen/location.
  }

  const knownDevices = [...deviceMap.values()].sort((a, b) => {
    if (a.isCurrent !== b.isCurrent) return a.isCurrent ? -1 : 1
    if (a.isActive !== b.isActive) return a.isActive ? -1 : 1
    return new Date(b.lastSeenAt).getTime() - new Date(a.lastSeenAt).getTime()
  })

  const lastLogin = mapped.find(s => s.isCurrent) ?? mapped[0]
  const { isQuoEnabled } = await import('./quo.service')
  const quoSmsEnabled = await isQuoEnabled(db)
  const channel = user.messageNotifyChannel === 'sms' ? 'sms' : 'email'

  return {
    id: user.id,
    name: user.name,
    email: user.email,
    accountType: '', // filled by route from auth context
    memberSince: user.createdAt.toISOString(),
    lastLoginAt: lastLogin?.lastActivityAt ?? null,
    activeSessionCount: mapped.length,
    sessions: mapped,
    knownDevices,
    teamChatEnabled: user.teamChatEnabled,
    messageEmailNotify: user.messageEmailNotify,
    phone: user.phone ?? null,
    messageNotifyChannel: channel,
    silentDeveloperMode: user.silentDeveloperMode,
    quoSmsEnabled,
  }
}

export async function updateAccountProfile(
  db: Db,
  userId: string,
  input: { firstName: string, lastName: string, email: string, phone?: string | null },
) {
  const email = input.email.trim().toLowerCase()
  const name = formatPersonName(input.firstName, input.lastName)
  const [existing] = await db
    .select({ id: users.id })
    .from(users)
    .where(and(eq(users.email, email), ne(users.id, userId)))

  if (existing) throw new AccountServiceError('EMAIL_TAKEN')

  const changes: Partial<typeof users.$inferInsert> = {
    name,
    email,
    updatedAt: new Date(),
  }
  if (input.phone !== undefined) {
    changes.phone = input.phone ?? null
    // Clearing the phone must drop Text preference so alerts don't silently email.
    if (!input.phone) changes.messageNotifyChannel = 'email'
  }

  const [user] = await db.update(users)
    .set(changes)
    .where(eq(users.id, userId))
    .returning()

  return user!
}

export async function updateAccountNotificationPrefs(
  db: Db,
  userId: string,
  input: {
    teamChatEnabled?: boolean
    messageEmailNotify?: boolean
    messageNotifyChannel?: 'email' | 'sms'
    silentDeveloperMode?: boolean
  },
) {
  if (
    input.teamChatEnabled === undefined
    && input.messageEmailNotify === undefined
    && input.messageNotifyChannel === undefined
    && input.silentDeveloperMode === undefined
  ) {
    const [user] = await db.select().from(users).where(eq(users.id, userId))
    if (!user) throw new AccountServiceError('SESSION_NOT_FOUND')
    return user
  }

  const [existing] = await db.select().from(users).where(eq(users.id, userId))
  if (!existing) throw new AccountServiceError('SESSION_NOT_FOUND')

  if (input.messageNotifyChannel === 'sms') {
    const { normalizePhoneE164 } = await import('../../shared/format/phone-e164')
    if (!normalizePhoneE164(existing.phone)) {
      throw new AccountServiceError('PHONE_REQUIRED')
    }
  }

  const changes: Partial<typeof users.$inferInsert> = { updatedAt: new Date() }
  if (input.teamChatEnabled !== undefined) changes.teamChatEnabled = input.teamChatEnabled
  if (input.messageEmailNotify !== undefined) changes.messageEmailNotify = input.messageEmailNotify
  if (input.messageNotifyChannel !== undefined) {
    changes.messageNotifyChannel = input.messageNotifyChannel
    // Choosing a channel implies the user wants chat/security notifications.
    changes.messageEmailNotify = true
  }
  if (input.silentDeveloperMode !== undefined) changes.silentDeveloperMode = input.silentDeveloperMode

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
