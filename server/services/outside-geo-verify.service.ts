import { and, desc, eq, gt, isNull, or } from 'drizzle-orm'
import { createHash, randomInt, timingSafeEqual } from 'node:crypto'
import type { Db } from '../db/client'
import { sessions, users } from '../db/schema/auth'
import { outsideGeoChallenges } from '../db/schema/outside-geo'
import { normalizeClientIp } from '../utils/client-ip'
import { enqueueJob } from './jobs.service'
import { resolveEmailBrand } from './email-branding.service'
import { getAppUrl } from './app-config.service'
import { buildOutsideGeofenceVerificationEmail } from '../mail/templates/system'

export const OUTSIDE_GEO_CODE_TTL_MS = 15 * 60 * 1000

export interface KnownOutsideGeoIdentity {
  userId: string
  userName: string
  userEmail: string
  match: 'ip_and_device' | 'ip' | 'device'
}

function hashCode(code: string): string {
  return createHash('sha256').update(code).digest('hex')
}

function codesEqual(a: string, b: string): boolean {
  const left = Buffer.from(a)
  const right = Buffer.from(b)
  if (left.length !== right.length) return false
  return timingSafeEqual(left, right)
}

export function generateOutsideGeoCode(): string {
  return String(randomInt(0, 1_000_000)).padStart(6, '0')
}

export function maskEmail(email: string): string {
  const trimmed = email.trim()
  const at = trimmed.indexOf('@')
  if (at <= 1) return '***'
  const local = trimmed.slice(0, at)
  const domain = trimmed.slice(at + 1)
  const visible = local.slice(0, Math.min(2, local.length))
  return `${visible}${'*'.repeat(Math.max(local.length - visible.length, 1))}@${domain}`
}

/**
 * Find a previously authenticated user associated with this IP and/or device.
 * Prefer IP+device matches, then IP, then device (user-agent).
 */
export async function findKnownOutsideGeoIdentity(
  db: Db,
  input: { ipAddress?: string | null, userAgent?: string | null },
): Promise<KnownOutsideGeoIdentity | null> {
  const ip = normalizeClientIp(input.ipAddress) ?? input.ipAddress?.trim() ?? null
  const userAgent = input.userAgent?.trim() || null
  if (!ip && !userAgent) return null

  const conditions = []
  if (ip) conditions.push(eq(sessions.ipAddress, ip))
  if (userAgent) conditions.push(eq(sessions.userAgent, userAgent))
  if (!conditions.length) return null

  // Include revoked/expired sessions — "known" means this IP/device signed in before.
  const rows = await db.select({
    userId: users.id,
    userName: users.name,
    userEmail: users.email,
    ipAddress: sessions.ipAddress,
    userAgent: sessions.userAgent,
  })
    .from(sessions)
    .innerJoin(users, eq(sessions.userId, users.id))
    .where(and(
      eq(users.isActive, true),
      or(...conditions),
    ))
    .orderBy(desc(sessions.createdAt))
    .limit(25)

  let best: KnownOutsideGeoIdentity | null = null
  let bestRank = 0
  for (const row of rows) {
    const ipMatch = !!(ip && row.ipAddress && String(row.ipAddress) === ip)
    const deviceMatch = !!(userAgent && row.userAgent && row.userAgent === userAgent)
    const rank = ipMatch && deviceMatch ? 3 : ipMatch ? 2 : deviceMatch ? 1 : 0
    if (rank > bestRank) {
      bestRank = rank
      best = {
        userId: row.userId,
        userName: row.userName,
        userEmail: row.userEmail,
        match: rank === 3 ? 'ip_and_device' : rank === 2 ? 'ip' : 'device',
      }
      if (rank === 3) break
    }
  }

  return best
}

export async function issueOutsideGeoChallenge(
  db: Db,
  input: {
    identity: KnownOutsideGeoIdentity
    ipAddress?: string | null
    userAgent?: string | null
    locationLabel?: string | null
  },
): Promise<{ challengeId: string, maskedEmail: string, code: string }> {
  const code = generateOutsideGeoCode()
  const expiresAt = new Date(Date.now() + OUTSIDE_GEO_CODE_TTL_MS)
  const ip = normalizeClientIp(input.ipAddress) ?? input.ipAddress ?? null

  // Invalidate prior unused challenges for this user (+ IP when known).
  const invalidateWhere = [
    eq(outsideGeoChallenges.userId, input.identity.userId),
    isNull(outsideGeoChallenges.usedAt),
  ]
  if (ip) invalidateWhere.push(eq(outsideGeoChallenges.ipAddress, ip))
  await db.update(outsideGeoChallenges)
    .set({ usedAt: new Date() })
    .where(and(...invalidateWhere))

  const [row] = await db.insert(outsideGeoChallenges).values({
    userId: input.identity.userId,
    userName: input.identity.userName,
    userEmail: input.identity.userEmail,
    codeHash: hashCode(code),
    ipAddress: ip,
    userAgent: input.userAgent ? input.userAgent.slice(0, 500) : null,
    locationLabel: input.locationLabel ?? null,
    expiresAt,
  }).returning({ id: outsideGeoChallenges.id })

  if (!row) throw new Error('FAILED_TO_CREATE_OUTSIDE_GEO_CHALLENGE')

  return {
    challengeId: row.id,
    maskedEmail: maskEmail(input.identity.userEmail),
    code,
  }
}

export async function enqueueOutsideGeoVerificationEmail(
  db: Db,
  input: {
    to: string
    name: string
    code: string
    locationLabel?: string | null
    ipAddress?: string | null
  },
) {
  const brand = await resolveEmailBrand(db)
  const appUrl = brand.appUrl || getAppUrl()
  const mail = buildOutsideGeofenceVerificationEmail({
    name: input.name,
    code: input.code,
    locationLabel: input.locationLabel ?? null,
    ipAddress: input.ipAddress ?? null,
    brandName: brand.brandName,
    appUrl,
    brand,
  })
  return enqueueJob(db, 'email_send', {
    to: input.to,
    subject: mail.subject,
    text: mail.text,
    html: mail.html,
    notificationKind: 'outside_geo_verification',
  })
}

export async function verifyOutsideGeoCode(
  db: Db,
  input: {
    code: string
    ipAddress?: string | null
    userAgent?: string | null
  },
): Promise<KnownOutsideGeoIdentity | null> {
  const code = input.code.replace(/\s+/g, '').trim()
  if (!/^\d{6}$/.test(code)) return null

  const ip = normalizeClientIp(input.ipAddress) ?? input.ipAddress ?? null
  const now = new Date()

  const conditions = [
    isNull(outsideGeoChallenges.usedAt),
    gt(outsideGeoChallenges.expiresAt, now),
  ]
  if (ip) conditions.push(eq(outsideGeoChallenges.ipAddress, ip))

  const [row] = await db.select()
    .from(outsideGeoChallenges)
    .where(and(...conditions))
    .orderBy(desc(outsideGeoChallenges.createdAt))
    .limit(1)

  if (!row) return null
  if (!codesEqual(row.codeHash, hashCode(code))) return null

  await db.update(outsideGeoChallenges)
    .set({ usedAt: now })
    .where(eq(outsideGeoChallenges.id, row.id))

  return {
    userId: row.userId,
    userName: row.userName,
    userEmail: row.userEmail,
    match: 'ip',
  }
}
