import { describe, expect, it } from 'vitest'
import { parseIpRule } from '../../shared/net/ip-match'
import type { SecurityPolicy } from '../../shared/validators/security-access'
import { DEFAULT_SECURITY_POLICY } from '../../shared/validators/security-access'
import type { BanEntry, SecuritySnapshot, ZoneEntry } from '../../server/services/security/evaluate'
import { evaluateAccess, findMatchingBan, needsCoordinates } from '../../server/services/security/evaluate'

/** A square roughly covering the New York metro area. */
const SQUARE = [
  { lat: 40, lng: -75 },
  { lat: 40, lng: -73 },
  { lat: 42, lng: -73 },
  { lat: 42, lng: -75 },
]

const INSIDE = { lat: 41, lng: -74 }
const OUTSIDE = { lat: 50, lng: -74 }

function ban(ipRule: string, overrides: Partial<BanEntry> = {}): BanEntry {
  const rule = parseIpRule(ipRule)
  if (!rule) throw new Error(`expected ${ipRule} to parse`)
  return { id: `ban-${ipRule}`, ipRule: rule.canonical, rule, reason: '', expiresAt: null, ...overrides }
}

function zone(kind: 'allow' | 'block', polygon = SQUARE, overrides: Partial<ZoneEntry> = {}): ZoneEntry {
  return {
    id: `zone-${kind}`,
    name: kind,
    kind,
    polygon,
    minLat: Math.min(...polygon.map(p => p.lat)),
    maxLat: Math.max(...polygon.map(p => p.lat)),
    minLng: Math.min(...polygon.map(p => p.lng)),
    maxLng: Math.max(...polygon.map(p => p.lng)),
    ...overrides,
  }
}

function snapshot(
  policy: Partial<SecurityPolicy> = {},
  bans: BanEntry[] = [],
  zones: ZoneEntry[] = [],
): SecuritySnapshot {
  return {
    policy: {
      ...DEFAULT_SECURITY_POLICY,
      // Shipping defaults are capture-only; these tests are about enforcement.
      enabled: true,
      ipEnforcement: 'enforce',
      geoEnforcement: 'enforce',
      ...policy,
    },
    bans,
    zones,
    loadedAt: Date.now(),
  }
}

const ipInput = { ip: '203.0.113.7', coords: null, geoSource: 'none' as const }

describe('findMatchingBan', () => {
  it('finds a ban covering the address', () => {
    expect(findMatchingBan([ban('203.0.113.0/24')], '203.0.113.7')?.ipRule).toBe('203.0.113.0/24')
  })

  it('skips bans that have already expired', () => {
    const expired = ban('203.0.113.7', { expiresAt: new Date(Date.now() - 1000) })
    expect(findMatchingBan([expired], '203.0.113.7')).toBeNull()
  })

  it('keeps bans that expire in the future', () => {
    const live = ban('203.0.113.7', { expiresAt: new Date(Date.now() + 60_000) })
    expect(findMatchingBan([live], '203.0.113.7')).not.toBeNull()
  })

  it('returns null without an address', () => {
    expect(findMatchingBan([ban('0.0.0.0/0')], null)).toBeNull()
  })
})

describe('evaluateAccess — master switch', () => {
  it('allows everything when security is disabled', () => {
    const snap = snapshot({ enabled: false }, [ban('203.0.113.7')])
    expect(evaluateAccess(snap, ipInput).blocked).toBe(false)
    expect(evaluateAccess(snap, ipInput).wouldBlock).toBe(false)
  })
})

describe('evaluateAccess — ip bans', () => {
  it('blocks a banned address when enforcing', () => {
    const result = evaluateAccess(snapshot({}, [ban('203.0.113.0/24')]), ipInput)
    expect(result).toMatchObject({ blocked: true, wouldBlock: true, reason: 'ip_banned' })
    expect(result.matchedBan?.ipRule).toBe('203.0.113.0/24')
  })

  it('records but does not block in monitor mode', () => {
    const snap = snapshot({ ipEnforcement: 'monitor' }, [ban('203.0.113.7')])
    expect(evaluateAccess(snap, ipInput)).toMatchObject({ blocked: false, wouldBlock: true, reason: 'ip_banned' })
  })

  it('ignores bans entirely when ip enforcement is off', () => {
    const snap = snapshot({ ipEnforcement: 'off' }, [ban('203.0.113.7')])
    expect(evaluateAccess(snap, ipInput).wouldBlock).toBe(false)
  })

  it('flags an exempt viewer without blocking them', () => {
    const snap = snapshot({}, [ban('203.0.113.7')])
    expect(evaluateAccess(snap, { ...ipInput, exempt: true })).toMatchObject({
      blocked: false,
      wouldBlock: true,
      reason: 'ip_banned',
    })
  })

  it('takes precedence over the geofence', () => {
    const snap = snapshot({}, [ban('203.0.113.7')], [zone('allow')])
    const result = evaluateAccess(snap, { ...ipInput, coords: INSIDE, geoSource: 'ip' })
    expect(result.reason).toBe('ip_banned')
  })
})

describe('evaluateAccess — geofence', () => {
  it('allows a point inside an allowed zone', () => {
    const snap = snapshot({}, [], [zone('allow')])
    expect(evaluateAccess(snap, { ...ipInput, coords: INSIDE, geoSource: 'ip' }).blocked).toBe(false)
  })

  it('blocks a point outside every allowed zone', () => {
    const snap = snapshot({}, [], [zone('allow')])
    expect(evaluateAccess(snap, { ...ipInput, coords: OUTSIDE, geoSource: 'ip' })).toMatchObject({
      blocked: true,
      reason: 'geo_outside_allowed',
    })
  })

  it('blocks a point inside a blocked zone even with no allowed zones', () => {
    const snap = snapshot({}, [], [zone('block')])
    expect(evaluateAccess(snap, { ...ipInput, coords: INSIDE, geoSource: 'ip' })).toMatchObject({
      blocked: true,
      reason: 'geo_inside_blocked',
    })
  })

  it('allows anywhere outside a blocked zone when no allowed zone exists', () => {
    const snap = snapshot({}, [], [zone('block')])
    expect(evaluateAccess(snap, { ...ipInput, coords: OUTSIDE, geoSource: 'ip' }).blocked).toBe(false)
  })

  it('lets a blocked zone override an overlapping allowed zone', () => {
    const snap = snapshot({}, [], [zone('allow'), zone('block')])
    expect(evaluateAccess(snap, { ...ipInput, coords: INSIDE, geoSource: 'ip' }).reason).toBe('geo_inside_blocked')
  })

  it('ignores zones with fewer than three points', () => {
    const snap = snapshot({}, [], [zone('allow', [{ lat: 40, lng: -75 }, { lat: 41, lng: -74 }])])
    expect(evaluateAccess(snap, { ...ipInput, coords: OUTSIDE, geoSource: 'ip' }).blocked).toBe(false)
  })

  it('allows everything when there are no zones at all', () => {
    expect(evaluateAccess(snapshot(), { ...ipInput, coords: OUTSIDE, geoSource: 'ip' }).blocked).toBe(false)
  })

  it('skips the geofence when asked to check the ip only', () => {
    const snap = snapshot({}, [], [zone('allow')])
    expect(evaluateAccess(snap, { ...ipInput, coords: OUTSIDE, geoSource: 'ip', skipGeo: true }).blocked).toBe(false)
  })

  it('records without blocking when geo enforcement is monitor', () => {
    const snap = snapshot({ geoEnforcement: 'monitor' }, [], [zone('allow')])
    expect(evaluateAccess(snap, { ...ipInput, coords: OUTSIDE, geoSource: 'ip' })).toMatchObject({
      blocked: false,
      wouldBlock: true,
      reason: 'geo_outside_allowed',
    })
  })
})

describe('evaluateAccess — unknown location', () => {
  it('allows by default rather than failing closed on a cold cache', () => {
    const snap = snapshot({}, [], [zone('allow')])
    expect(evaluateAccess(snap, ipInput)).toMatchObject({ blocked: false, wouldBlock: false })
  })

  it('blocks an unknown location when the policy says so', () => {
    const snap = snapshot({ geoUnknownAction: 'block' }, [], [zone('allow')])
    expect(evaluateAccess(snap, ipInput)).toMatchObject({ blocked: true, reason: 'geo_unknown' })
  })

  it('defers an unknown location for the caller that cannot resolve it', () => {
    const snap = snapshot({ geoUnknownAction: 'block' }, [], [zone('allow')])
    expect(evaluateAccess(snap, { ...ipInput, deferUnknownGeo: true })).toMatchObject({
      blocked: false,
      wouldBlock: false,
      reason: null,
    })
  })
})

describe('evaluateAccess — device accuracy', () => {
  it('discards a device fix that is wider than the ceiling', () => {
    const snap = snapshot({ maxDeviceAccuracyM: 1000 }, [], [zone('allow')])
    const result = evaluateAccess(snap, {
      ip: '203.0.113.7',
      coords: OUTSIDE,
      geoSource: 'device',
      accuracyM: 50_000,
    })
    expect(result.blocked).toBe(false)
    expect(result.usedCoords).toBeNull()
    expect(result.usedGeoSource).toBe('none')
  })

  it('forgives a fix just outside the edge within its own uncertainty', () => {
    const snap = snapshot({ geoAccuracyBufferM: 0 }, [], [zone('allow')])
    // ~1.1 km north of the 42° edge; a 3 km fix radius should cover it.
    const justOutside = { lat: 42.01, lng: -74 }
    expect(evaluateAccess(snap, {
      ip: '203.0.113.7',
      coords: justOutside,
      geoSource: 'device',
      accuracyM: 3000,
    }).blocked).toBe(false)
  })

  it('still blocks a precise fix well outside the edge', () => {
    const snap = snapshot({ geoAccuracyBufferM: 0 }, [], [zone('allow')])
    expect(evaluateAccess(snap, {
      ip: '203.0.113.7',
      coords: OUTSIDE,
      geoSource: 'device',
      accuracyM: 20,
    }).reason).toBe('geo_outside_allowed')
  })
})

describe('needsCoordinates', () => {
  it('is true when a zone is configured and the location is unknown', () => {
    expect(needsCoordinates(snapshot({}, [], [zone('allow')]), null)).toBe(true)
  })

  it('is false once coordinates are known', () => {
    expect(needsCoordinates(snapshot({}, [], [zone('allow')]), INSIDE)).toBe(false)
  })

  it('is false with no zones, with geo off, or with security disabled', () => {
    expect(needsCoordinates(snapshot(), null)).toBe(false)
    expect(needsCoordinates(snapshot({ geoEnforcement: 'off' }, [], [zone('allow')]), null)).toBe(false)
    expect(needsCoordinates(snapshot({ enabled: false }, [], [zone('allow')]), null)).toBe(false)
  })
})
