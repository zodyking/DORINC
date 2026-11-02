import { and, desc, eq, ne } from 'drizzle-orm'
import type { Db } from '../db/client'
import { sessions } from '../db/schema/auth'
import { hashToken } from '../auth/tokens'
import {
  formatNetworkLabel,
  networkKeyFromIp,
} from '../../shared/known-network'
import { normalizeClientIp } from '../utils/client-ip'

export interface KnownNetworkRow {
  key: string
  label: string
  ipAddress: string | null
  locationLabel: string | null
  firstSeenAt: string
  lastSeenAt: string
  sessionCount: number
  isCurrent: boolean
}

/**
 * True when this user has signed in from the same network before
 * (IPv4 /24 or IPv6 /64). The just-created session is ignored so the
 * current attempt cannot count as its own history.
 */
export async function userHasKnownNetwork(
  db: Db,
  input: {
    userId: string
    ipAddress?: string | null
    excludeSessionToken?: string | null
    excludeSessionId?: string | null
  },
): Promise<boolean> {
  const ip = normalizeClientIp(input.ipAddress) ?? input.ipAddress?.trim() ?? null
  const key = networkKeyFromIp(ip)
  if (!key || !input.userId) return false

  const excludeHash = input.excludeSessionToken
    ? hashToken(input.excludeSessionToken)
    : null

  const rows = await db
    .select({
      id: sessions.id,
      ipAddress: sessions.ipAddress,
      tokenHash: sessions.tokenHash,
      createdAt: sessions.createdAt,
      lastActivityAt: sessions.lastActivityAt,
      revokedAt: sessions.revokedAt,
    })
    .from(sessions)
    .where(and(
      eq(sessions.userId, input.userId),
      ...(input.excludeSessionId ? [ne(sessions.id, input.excludeSessionId)] : []),
      ...(excludeHash ? [ne(sessions.tokenHash, excludeHash)] : []),
    ))
    .orderBy(desc(sessions.lastActivityAt))
    .limit(250)

  for (const row of rows) {
    if (!isCompletedSignInSession(row)) continue
    const prior = row.ipAddress != null ? String(row.ipAddress) : null
    if (networkKeyFromIp(prior) === key) return true
  }
  return false
}

/** Ignore sessions revoked immediately after create (blocked / abandoned logins). */
function isCompletedSignInSession(row: {
  createdAt: Date
  lastActivityAt: Date
  revokedAt: Date | null
}): boolean {
  if (!row.revokedAt) return true
  if (row.lastActivityAt.getTime() - row.createdAt.getTime() >= 5_000) return true
  return row.revokedAt.getTime() - row.createdAt.getTime() >= 15_000
}

export async function listKnownNetworks(
  db: Db,
  userId: string,
  currentSessionId?: string | null,
): Promise<KnownNetworkRow[]> {
  const rows = await db
    .select({
      id: sessions.id,
      ipAddress: sessions.ipAddress,
      locationLabel: sessions.locationLabel,
      lastActivityAt: sessions.lastActivityAt,
      createdAt: sessions.createdAt,
    })
    .from(sessions)
    .where(eq(sessions.userId, userId))
    .orderBy(desc(sessions.lastActivityAt))
    .limit(500)

  const grouped = new Map<string, KnownNetworkRow>()
  for (const row of rows) {
    const ip = row.ipAddress != null ? String(row.ipAddress) : null
    const key = networkKeyFromIp(ip)
    if (!key) continue
    const lastSeenAt = row.lastActivityAt.toISOString()
    const createdAt = row.createdAt.toISOString()
    const isCurrent = Boolean(currentSessionId && row.id === currentSessionId)
    const existing = grouped.get(key)
    if (!existing) {
      grouped.set(key, {
        key,
        label: formatNetworkLabel(key),
        ipAddress: ip,
        locationLabel: row.locationLabel,
        firstSeenAt: createdAt,
        lastSeenAt,
        sessionCount: 1,
        isCurrent,
      })
      continue
    }
    existing.sessionCount += 1
    if (isCurrent) existing.isCurrent = true
    if (row.createdAt.getTime() < new Date(existing.firstSeenAt).getTime()) {
      existing.firstSeenAt = createdAt
    }
  }

  return [...grouped.values()].sort((a, b) => {
    if (a.isCurrent !== b.isCurrent) return a.isCurrent ? -1 : 1
    return new Date(b.lastSeenAt).getTime() - new Date(a.lastSeenAt).getTime()
  })
}
