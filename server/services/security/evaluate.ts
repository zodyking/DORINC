import type { GeoPoint } from '../../../shared/geo/point-in-polygon'
import { isPointInPolygon, isPointInPolygonWithBuffer } from '../../../shared/geo/point-in-polygon'
import type { IpRule } from '../../../shared/net/ip-match'
import { ipMatchesRule } from '../../../shared/net/ip-match'
import type {
  GeoSource,
  SecurityBlockReason,
  SecurityPolicy,
  SecurityZoneKind,
} from '../../../shared/validators/security'

export interface BanEntry {
  id: string
  ipRule: string
  rule: IpRule
  reason: string
  expiresAt: Date | null
}

export interface ZoneEntry {
  id: string
  name: string
  kind: SecurityZoneKind
  polygon: GeoPoint[]
  minLat: number | null
  maxLat: number | null
  minLng: number | null
  maxLng: number | null
}

/** Immutable view of everything the enforcement path needs, held in memory. */
export interface SecuritySnapshot {
  policy: SecurityPolicy
  bans: BanEntry[]
  zones: ZoneEntry[]
  loadedAt: number
}

export interface AccessEvaluationInput {
  ip: string | null
  coords: GeoPoint | null
  geoSource: GeoSource
  /** Reported radius of uncertainty in metres for a device fix. */
  accuracyM?: number | null
  /** Super admins evaluate normally but are never actually denied. */
  exempt?: boolean
  /**
   * Treat an unresolved location as "not yet known" instead of applying
   * `geoUnknownAction`. The synchronous middleware sets this so a caller that
   * cannot perform a network lookup defers to the check endpoint that can.
   */
  deferUnknownGeo?: boolean
  /**
   * Run the IP ban check only. Staff sign-in sets this for the first step,
   * where the device fix that the geofence should be judged against has not
   * been collected yet.
   */
  skipGeo?: boolean
}

export interface AccessEvaluation {
  /** The request should be denied right now. */
  blocked: boolean
  /** A rule matched, even if monitor mode or an exemption let it through. */
  wouldBlock: boolean
  reason: SecurityBlockReason | null
  matchedBan: BanEntry | null
  matchedZone: ZoneEntry | null
  /** Coordinates actually used, after discarding a too-imprecise device fix. */
  usedCoords: GeoPoint | null
  usedGeoSource: GeoSource
}

const ALLOWED: AccessEvaluation = {
  blocked: false,
  wouldBlock: false,
  reason: null,
  matchedBan: null,
  matchedZone: null,
  usedCoords: null,
  usedGeoSource: 'none',
}

function withinBounds(point: GeoPoint, zone: ZoneEntry, bufferDeg: number): boolean {
  if (zone.minLat == null || zone.maxLat == null || zone.minLng == null || zone.maxLng == null) {
    return true
  }
  return point.lat >= zone.minLat - bufferDeg
    && point.lat <= zone.maxLat + bufferDeg
    && point.lng >= zone.minLng - bufferDeg
    && point.lng <= zone.maxLng + bufferDeg
}

export function findMatchingBan(bans: BanEntry[], ip: string | null, now = new Date()): BanEntry | null {
  if (!ip) return null
  for (const ban of bans) {
    if (ban.expiresAt && ban.expiresAt.getTime() <= now.getTime()) continue
    if (ipMatchesRule(ip, ban.rule)) return ban
  }
  return null
}

/**
 * Decide whether a request is allowed.
 *
 * IP bans take precedence over geofencing. Geofencing only ever runs when at
 * least one zone is enabled, and an unresolvable location follows
 * `policy.geoUnknownAction` (allow by default) rather than failing closed —
 * failing closed on a cold geolocation cache denies legitimate first-time
 * visitors from every new network.
 */
export function evaluateAccess(
  snapshot: SecuritySnapshot,
  input: AccessEvaluationInput,
  now = new Date(),
): AccessEvaluation {
  const { policy } = snapshot
  if (!policy.enabled) return ALLOWED

  const exempt = input.exempt === true

  if (policy.ipEnforcement !== 'off') {
    const matchedBan = findMatchingBan(snapshot.bans, input.ip, now)
    if (matchedBan) {
      return {
        blocked: !exempt && policy.ipEnforcement === 'enforce',
        wouldBlock: true,
        reason: 'ip_banned',
        matchedBan,
        matchedZone: null,
        usedCoords: input.coords,
        usedGeoSource: input.coords ? input.geoSource : 'none',
      }
    }
  }

  if (policy.geoEnforcement === 'off' || input.skipGeo) {
    return { ...ALLOWED, usedCoords: input.coords, usedGeoSource: input.geoSource }
  }

  const zones = snapshot.zones.filter(zone => zone.polygon.length >= 3)
  if (!zones.length) return { ...ALLOWED, usedCoords: input.coords, usedGeoSource: input.geoSource }

  // A device fix wider than the configured ceiling tells us nothing useful.
  const tooImprecise = input.geoSource === 'device'
    && input.accuracyM != null
    && policy.maxDeviceAccuracyM > 0
    && input.accuracyM > policy.maxDeviceAccuracyM

  const coords = tooImprecise ? null : input.coords
  const geoSource: GeoSource = coords ? input.geoSource : 'none'

  if (!coords) {
    if (input.deferUnknownGeo) {
      return { ...ALLOWED, usedCoords: null, usedGeoSource: 'none' }
    }
    const wouldBlock = policy.geoUnknownAction === 'block'
    return {
      blocked: wouldBlock && !exempt && policy.geoEnforcement === 'enforce',
      wouldBlock,
      reason: wouldBlock ? 'geo_unknown' : null,
      matchedBan: null,
      matchedZone: null,
      usedCoords: null,
      usedGeoSource: 'none',
    }
  }

  const blockZones = zones.filter(zone => zone.kind === 'block')
  for (const zone of blockZones) {
    if (!withinBounds(coords, zone, 0)) continue
    if (isPointInPolygon(coords, zone.polygon)) {
      return {
        blocked: !exempt && policy.geoEnforcement === 'enforce',
        wouldBlock: true,
        reason: 'geo_inside_blocked',
        matchedBan: null,
        matchedZone: zone,
        usedCoords: coords,
        usedGeoSource: geoSource,
      }
    }
  }

  const allowZones = zones.filter(zone => zone.kind === 'allow')
  if (!allowZones.length) {
    return { ...ALLOWED, usedCoords: coords, usedGeoSource: geoSource }
  }

  // Give the reported GPS uncertainty the benefit of the doubt near an edge.
  const bufferM = policy.geoAccuracyBufferM
    + (geoSource === 'device' && input.accuracyM != null ? Math.max(0, input.accuracyM) : 0)
  const bufferDeg = bufferM / 111_000

  for (const zone of allowZones) {
    if (!withinBounds(coords, zone, bufferDeg)) continue
    if (isPointInPolygonWithBuffer(coords, zone.polygon, bufferM)) {
      return { ...ALLOWED, usedCoords: coords, usedGeoSource: geoSource }
    }
  }

  return {
    blocked: !exempt && policy.geoEnforcement === 'enforce',
    wouldBlock: true,
    reason: 'geo_outside_allowed',
    matchedBan: null,
    matchedZone: allowZones[0] ?? null,
    usedCoords: coords,
    usedGeoSource: geoSource,
  }
}

/** True when a geofence decision still needs coordinates we do not have. */
export function needsCoordinates(snapshot: SecuritySnapshot, coords: GeoPoint | null): boolean {
  if (!snapshot.policy.enabled) return false
  if (snapshot.policy.geoEnforcement === 'off') return false
  if (coords) return false
  return snapshot.zones.some(zone => zone.polygon.length >= 3)
}
