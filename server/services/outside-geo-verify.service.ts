import { and, desc, eq, gt, isNull, or } from 'drizzle-orm'
import { createHash, randomInt, timingSafeEqual } from 'node:crypto'
import type { Db } from '../db/client'
import { sessions, users } from '../db/schema/auth'
import { outsideGeoChallenges } from '../db/schema/outside-geo'
import { normalizeClientIp } from '../utils/client-ip'
import { normalizeDeviceId } from '../utils/device-id'
import { enqueueJob } from './jobs.service'
import { resolveEmailBrand } from './email-branding.service'
import { getAppUrl } from './app-config.service'
import { buildOutsideGeofenceVerificationEmail } from '../mail/templates/system'

export const OUTSIDE_GEO_CODE_TTL_MS = 15 * 60 * 1000

export interface KnownOutsideGeoIdentity {
  userId: string
  userName: string
  userEmail: string
  phone?: string | null
  messageNotifyChannel?: string | null
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
 * Prefer IP+device_id, then device_id, then IP, then user-agent fallback.
 */
export async function findKnownOutsideGeoIdentity(
  db: Db,
  input: { ipAddress?: string | null, userAgent?: string | null, deviceId?: string | null },
): Promise<KnownOutsideGeoIdentity | null> {
  const ip = normalizeClientIp(input.ipAddress) ?? input.ipAddress?.trim() ?? null
  const userAgent = input.userAgent?.trim() || null
  const deviceId = normalizeDeviceId(input.deviceId)
  if (!ip && !userAgent && !deviceId) return null

  const conditions = []
  if (deviceId) conditions.push(eq(sessions.deviceId, deviceId))
  if (ip) conditions.push(eq(sessions.ipAddress, ip))
  if (userAgent) conditions.push(eq(sessions.userAgent, userAgent))
  if (!conditions.length) return null

  // Include revoked/expired sessions — "known" means this IP/device signed in before.
  const rows = await db.select({
    userId: users.id,
    userName: users.name,
    userEmail: users.email,
    phone: users.phone,
    messageNotifyChannel: users.messageNotifyChannel,
    ipAddress: sessions.ipAddress,
    userAgent: sessions.userAgent,
    deviceId: sessions.deviceId,
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
    const deviceIdMatch = !!(deviceId && row.deviceId && row.deviceId === deviceId)
    const uaMatch = !!(userAgent && row.userAgent && row.userAgent === userAgent)
    const deviceMatch = deviceIdMatch || uaMatch
    // Rank: IP+device_id (5), device_id (4), IP+UA (3), IP (2), UA (1)
    const rank = ipMatch && deviceIdMatch
      ? 5
      : deviceIdMatch
        ? 4
        : ipMatch && uaMatch
          ? 3
          : ipMatch
            ? 2
            : deviceMatch
              ? 1
              : 0
    if (rank > bestRank) {
      bestRank = rank
      best = {
        userId: row.userId,
        userName: row.userName,
        userEmail: row.userEmail,
        phone: row.phone,
        messageNotifyChannel: row.messageNotifyChannel,
        match: (rank >= 3 && deviceMatch && ipMatch) || rank === 5
          ? 'ip_and_device'
          : rank === 2
            ? 'ip'
            : 'device',
      }
      if (rank >= 5) break
    }
  }

  return best
}

/** True when an unused, unexpired challenge already exists for this IP. */
export async function hasActiveOutsideGeoChallenge(
  db: Db,
  input: { ipAddress?: string | null },
): Promise<boolean> {
  const ip = normalizeClientIp(input.ipAddress) ?? input.ipAddress ?? null
  if (!ip) return false
  const now = new Date()
  const [row] = await db.select({ id: outsideGeoChallenges.id })
    .from(outsideGeoChallenges)
    .where(and(
      eq(outsideGeoChallenges.ipAddress, ip),
      isNull(outsideGeoChallenges.usedAt),
      gt(outsideGeoChallenges.expiresAt, now),
    ))
    .orderBy(desc(outsideGeoChallenges.createdAt))
    .limit(1)
  return !!row
}

/**
 * Issue + email a challenge for a known IP/device without returning identity
 * details to the caller (keeps browser/network responses non-scoping).
 */
export async function quietlyIssueOutsideGeoChallenge(
  db: Db,
  input: {
    ipAddress?: string | null
    userAgent?: string | null
    deviceId?: string | null
    locationLabel?: string | null
    force?: boolean
  },
): Promise<'issued' | 'already_active' | 'unknown' | 'failed'> {
  try {
    if (!input.force && await hasActiveOutsideGeoChallenge(db, { ipAddress: input.ipAddress })) {
      return 'already_active'
    }
    const identity = await findKnownOutsideGeoIdentity(db, {
      ipAddress: input.ipAddress,
      userAgent: input.userAgent,
      deviceId: input.deviceId,
    })
    if (!identity) return 'unknown'

    const challenge = await issueOutsideGeoChallenge(db, {
      identity,
      ipAddress: input.ipAddress,
      userAgent: input.userAgent,
      deviceId: input.deviceId,
      locationLabel: input.locationLabel ?? null,
    })
    await enqueueOutsideGeoVerification(db, {
      identity,
      code: challenge.code,
      locationLabel: input.locationLabel ?? null,
      ipAddress: input.ipAddress,
    })
    return 'issued'
  }
  catch (err) {
    console.warn('[outside-geo] quiet challenge failed:', (err as Error).message)
    return 'failed'
  }
}

export async function issueOutsideGeoChallenge(
  db: Db,
  input: {
    identity: KnownOutsideGeoIdentity
    ipAddress?: string | null
    userAgent?: string | null
    deviceId?: string | null
    locationLabel?: string | null
  },
): Promise<{ challengeId: string, maskedEmail: string, code: string }> {
  const code = generateOutsideGeoCode()
  const expiresAt = new Date(Date.now() + OUTSIDE_GEO_CODE_TTL_MS)
  const ip = normalizeClientIp(input.ipAddress) ?? input.ipAddress ?? null
  const deviceId = normalizeDeviceId(input.deviceId)

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
    deviceId,
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
  const { getActiveEmailTemplateContent } = await import('./email-templates.service')
  const templateOverride = await getActiveEmailTemplateContent(db, 'outside_geofence_verification')
  const appUrl = brand.appUrl || getAppUrl()
  const mail = buildOutsideGeofenceVerificationEmail({
    name: input.name,
    code: input.code,
    locationLabel: input.locationLabel ?? null,
    ipAddress: input.ipAddress ?? null,
    brandName: brand.brandName,
    appUrl,
    brand,
    templateOverride,
  })
  return enqueueJob(db, 'email_send', {
    to: input.to,
    subject: mail.subject,
    text: mail.text,
    html: mail.html,
    notificationKind: 'outside_geo_verification',
  })
}

export async function enqueueOutsideGeoVerification(
  db: Db,
  input: {
    identity: KnownOutsideGeoIdentity
    code: string
    locationLabel?: string | null
    ipAddress?: string | null
  },
) {
  const { resolveUserNotifyDelivery } = await import('./user-notify-channel.service')
  const delivery = await resolveUserNotifyDelivery(db, {
    email: input.identity.userEmail,
    phone: input.identity.phone,
    messageNotifyChannel: input.identity.messageNotifyChannel,
  })

  if (delivery?.channel === 'sms') {
    const { enqueueTemplatedSms } = await import('./sms-notifications.service')
    return enqueueTemplatedSms(db, {
      to: delivery.phone,
      typeKey: 'outside_geofence_verification',
      vars: {
        name: input.identity.userName,
        code: input.code,
        expiresMinutes: String(Math.round(OUTSIDE_GEO_CODE_TTL_MS / 60_000)),
      },
      meta: { userId: input.identity.userId },
    })
  }

  return enqueueOutsideGeoVerificationEmail(db, {
    to: input.identity.userEmail,
    name: input.identity.userName,
    code: input.code,
    locationLabel: input.locationLabel,
    ipAddress: input.ipAddress,
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
