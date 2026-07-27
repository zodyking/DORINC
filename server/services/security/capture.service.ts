import { and, eq, gte, sql } from 'drizzle-orm'
import type { Db } from '../../db/client'
import { accessEvents } from '../../db/schema/security-access'
import type { GeoPoint } from '../../../shared/geo/point-in-polygon'
import { parseIp } from '../../../shared/net/ip-match'
import type {
  GeoSource,
  SecurityEventOutcome,
  SecurityEventStage,
  SecurityEventType,
} from '../../../shared/validators/security-access'
import { resolveIpGeo, type IpGeoResult } from '../ip-geolocation.service'
import { createIpBan, recordBanHit } from './ip-bans.service'
import { recordGeofenceHit } from './geofences.service'
import { recordAccessEvent } from './access-events.service'
import { evaluateAccess, type AccessEvaluation } from './evaluate'
import { getSecuritySnapshot } from './policy.service'

export interface DeviceFix {
  latitude: number
  longitude: number
  accuracyM?: number | null
}

export interface CaptureAccessInput {
  eventType: SecurityEventType
  stage: SecurityEventStage
  ip: string | null
  /** Browser GPS fix when we have one — always preferred over IP geolocation. */
  device?: DeviceFix | null
  path?: string | null
  userAgent?: string | null
  requestId?: string | null
  timezone?: string | null
  /** Reverse-geocoded device address, preferred over the IP-derived label. */
  locationLabel?: string | null

  viewer?: { id: string, name: string, email: string } | null
  sessionId?: string | null
  exempt?: boolean
  /** Evaluate the IP ban list only, leaving the geofence to a later stage. */
  skipGeo?: boolean

  /** Outcome to record when the request is not blocked. */
  outcome?: SecurityEventOutcome
  attemptedIdentifier?: string | null
  attemptedPortal?: string | null
  passwordFingerprint?: string | null
  passwordLength?: number | null
  accountExists?: boolean | null
  failureReason?: string | null

  /** Skip the IP geolocation network call (used by the fast middleware path). */
  skipIpLookup?: boolean
  /**
   * Only write a row when a rule matched. Pre-authentication gate checks set
   * this so a sign-in produces one row for its real outcome instead of two.
   */
  recordOnlyIfFlagged?: boolean
  /**
   * Evaluate and update the ban/zone counters, but write no event row. Used
   * when a chatty client has already been recorded inside the throttle window,
   * so the counters stay exact without the table filling up.
   */
  recordEvent?: boolean
}

export interface CaptureAccessResult {
  evaluation: AccessEvaluation
  eventId: string | null
  geo: IpGeoResult | null
  coords: GeoPoint | null
}

function outcomeFor(input: CaptureAccessInput, evaluation: AccessEvaluation): SecurityEventOutcome {
  // Wrong credentials are the more useful fact to record even if the request
  // would also have been blocked by a rule.
  if (input.outcome === 'login_failed') return 'login_failed'
  if (evaluation.blocked) return 'blocked'
  if (evaluation.wouldBlock) return 'would_block'
  return input.outcome ?? 'allowed'
}

/**
 * Resolve where a request came from, decide whether it is allowed, and write
 * the result to the event log. This is the single path used by page loads, the
 * browser check worker, and both sign-in stages so every surface agrees.
 */
export async function captureAccess(db: Db, input: CaptureAccessInput): Promise<CaptureAccessResult> {
  const snapshot = getSecuritySnapshot()

  const geo = input.skipIpLookup || !input.ip ? null : await resolveIpGeo(input.ip).catch(() => null)
  const ipCoords: GeoPoint | null = geo?.latitude != null && geo.longitude != null
    ? { lat: geo.latitude, lng: geo.longitude }
    : null
  const deviceCoords: GeoPoint | null = input.device
    ? { lat: input.device.latitude, lng: input.device.longitude }
    : null

  // A device fix is authoritative; IP geolocation is only city-accurate.
  const coords = deviceCoords ?? ipCoords
  const geoSource: GeoSource = deviceCoords ? 'device' : (ipCoords ? 'ip' : 'none')
  const accuracyM = deviceCoords ? input.device?.accuracyM ?? null : null

  const evaluation = evaluateAccess(snapshot, {
    ip: input.ip,
    coords,
    geoSource,
    accuracyM,
    exempt: input.exempt,
    skipGeo: input.skipGeo,
  })

  const outcome = outcomeFor(input, evaluation)
  const flagged = evaluation.blocked || evaluation.wouldBlock
  const write = input.recordEvent !== false && !(input.recordOnlyIfFlagged && !flagged)

  const eventId = !write ? null : await recordAccessEvent(db, {
    eventType: input.eventType,
    stage: input.stage,
    outcome,
    blockReason: evaluation.reason,
    enforced: evaluation.blocked,

    ipAddress: input.ip,
    matchedIpRule: evaluation.matchedBan?.ipRule ?? null,
    matchedBanId: evaluation.matchedBan?.id ?? null,
    matchedGeofenceId: evaluation.matchedZone?.id ?? null,
    matchedGeofenceName: evaluation.matchedZone?.name ?? null,

    userId: input.viewer?.id ?? null,
    userName: input.viewer?.name ?? null,
    userEmail: input.viewer?.email ?? null,
    sessionId: input.sessionId ?? null,
    path: input.path ?? null,
    userAgent: input.userAgent ?? null,
    requestId: input.requestId ?? null,

    latitude: coords?.lat ?? null,
    longitude: coords?.lng ?? null,
    geoSource,
    accuracyM,
    ipLatitude: ipCoords?.lat ?? null,
    ipLongitude: ipCoords?.lng ?? null,
    deviceLatitude: deviceCoords?.lat ?? null,
    deviceLongitude: deviceCoords?.lng ?? null,

    locationLabel: input.locationLabel ?? geo?.label ?? null,
    city: geo?.city ?? null,
    region: geo?.regionCode ?? geo?.region ?? null,
    postalCode: geo?.postalCode ?? null,
    country: geo?.country ?? null,
    timezone: input.timezone ?? geo?.timezone ?? null,

    attemptedIdentifier: input.attemptedIdentifier ?? null,
    attemptedPortal: input.attemptedPortal ?? null,
    passwordFingerprint: input.passwordFingerprint ?? null,
    passwordLength: input.passwordLength ?? null,
    accountExists: input.accountExists ?? null,
    failureReason: input.failureReason ?? null,
  }).catch((err) => {
    console.warn(`[security] failed to record access event: ${(err as Error).message}`)
    return null
  })

  // Counters make the ban and zone tables self-documenting over time.
  if (evaluation.matchedBan) {
    await recordBanHit(db, evaluation.matchedBan.id, {
      locationLabel: geo?.label ?? null,
      country: geo?.country ?? null,
      latitude: coords?.lat ?? null,
      longitude: coords?.lng ?? null,
      userAgent: input.userAgent ?? null,
      identifier: input.attemptedIdentifier ?? null,
    }).catch(() => {})
  }
  if (evaluation.matchedZone && evaluation.wouldBlock) {
    await recordGeofenceHit(db, evaluation.matchedZone.id).catch(() => {})
  }

  return { evaluation, eventId, geo, coords }
}

export interface AutoBanResult {
  banned: boolean
  ipRule: string | null
  attempts: number
}

/**
 * Ban an IP that has crossed the configured failed-login threshold. Runs after
 * a failed sign-in is recorded, so the count includes the attempt that just
 * happened. No-ops when auto-ban is off or the IP is already covered.
 */
export async function maybeAutoBan(db: Db, ip: string | null): Promise<AutoBanResult> {
  const { policy, bans } = getSecuritySnapshot()
  const auto = policy.autoBan
  if (!policy.enabled || !auto.enabled || !ip) return { banned: false, ipRule: null, attempts: 0 }

  const parsed = parseIp(ip)
  if (!parsed) return { banned: false, ipRule: null, attempts: 0 }
  if (bans.some(ban => ban.ipRule === parsed.canonical)) {
    return { banned: false, ipRule: parsed.canonical, attempts: 0 }
  }

  const since = new Date(Date.now() - auto.windowMinutes * 60_000)
  const [row] = await db.select({
    attempts: sql<number>`count(*)::int`,
    identifiers: sql<string[]>`array_remove(array_agg(DISTINCT ${accessEvents.attemptedIdentifier}), NULL)`,
    locationLabel: sql<string | null>`(array_remove(array_agg(${accessEvents.locationLabel}), NULL))[1]`,
    country: sql<string | null>`(array_remove(array_agg(${accessEvents.country}), NULL))[1]`,
    latitude: sql<number | null>`(array_remove(array_agg(${accessEvents.latitude}), NULL))[1]`,
    longitude: sql<number | null>`(array_remove(array_agg(${accessEvents.longitude}), NULL))[1]`,
    userAgent: sql<string | null>`(array_remove(array_agg(${accessEvents.userAgent}), NULL))[1]`,
  })
    .from(accessEvents)
    .where(and(
      eq(accessEvents.outcome, 'login_failed'),
      gte(accessEvents.createdAt, since),
      sql`host(${accessEvents.ipAddress}) = ${parsed.canonical}`,
    ))

  const attempts = Number(row?.attempts ?? 0)
  if (attempts < auto.failedAttempts) return { banned: false, ipRule: parsed.canonical, attempts }

  const expiresAt = auto.durationMinutes > 0
    ? new Date(Date.now() + auto.durationMinutes * 60_000)
    : null

  await createIpBan(db, {
    ipRule: parsed.canonical,
    reason: `Automatic: ${attempts} failed sign-in attempts in ${auto.windowMinutes} minutes`,
    source: 'auto_failed_logins',
    expiresAt,
    triggerAttempts: attempts,
    observed: {
      locationLabel: row?.locationLabel ?? null,
      country: row?.country ?? null,
      latitude: row?.latitude ?? null,
      longitude: row?.longitude ?? null,
      userAgent: row?.userAgent ?? null,
      identifiers: Array.isArray(row?.identifiers) ? row.identifiers : [],
    },
  })

  console.warn(`[security] auto-banned ${parsed.canonical} after ${attempts} failed sign-ins`)
  return { banned: true, ipRule: parsed.canonical, attempts }
}
