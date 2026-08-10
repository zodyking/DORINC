import { describe, expect, it } from 'vitest'
import {
  evaluateAccessDecision,
  isAccessGateEnforcing,
  isAccessGateGeoActive,
} from '../../server/services/access-gate.service'
import { DEFAULT_ACCESS_GATE_SETTINGS, type AccessGateSettings } from '../../shared/validators/access-gate'
import { deviceSignalsSchema, visitBeaconBodySchema } from '../../shared/validators/device-signals'
import { accessEventWhen, shortFingerprint } from '../../app/utils/access-gate-map'

function settings(overrides: Partial<AccessGateSettings>): AccessGateSettings {
  return { ...DEFAULT_ACCESS_GATE_SETTINGS, ...overrides }
}

const areaSquare = [
  { lat: 40, lng: -75 },
  { lat: 40, lng: -73 },
  { lat: 42, lng: -73 },
  { lat: 42, lng: -75 },
]

describe('access gate geo reliability helpers', () => {
  it('detects active geofence only with polygon + geo mode', () => {
    expect(isAccessGateGeoActive(settings({
      enabled: true,
      blockMode: 'geo',
      allowedPolygon: areaSquare,
    }))).toBe(true)
    expect(isAccessGateGeoActive(settings({
      enabled: true,
      blockMode: 'geo',
      allowedPolygon: [{ lat: 1, lng: 1 }],
    }))).toBe(false)
    expect(isAccessGateEnforcing(settings({ enabled: true, blockMode: 'off' }))).toBe(false)
    expect(isAccessGateEnforcing(settings({ enabled: true, blockMode: 'both' }))).toBe(true)
  })

  it('fails closed on login-style checks when coords are unknown', () => {
    const s = settings({ enabled: true, blockMode: 'geo', allowedPolygon: areaSquare })
    // Default strictGeo — no fail-open override.
    const decision = evaluateAccessDecision(s, { ip: '9.9.9.9', coords: null })
    expect(decision.blocked).toBe(true)
    expect(decision.reason).toBe('geo_unknown')
  })
})

describe('device signals validators', () => {
  it('accepts a full visit beacon payload', () => {
    const parsed = visitBeaconBodySchema.parse({
      path: '/invoices',
      signals: {
        userAgent: 'Mozilla/5.0',
        os: 'iOS 17',
        deviceType: 'mobile',
        screenResolution: '390x844',
        devicePixelRatio: 3,
        cpuCores: 6,
        deviceMemoryGb: 4,
        gpuRenderer: 'Apple GPU',
        canvasFingerprint: 'abc123',
        webglFingerprint: 'def456',
        audioFingerprint: 'ghi789',
        timezone: 'America/New_York',
        language: 'en-US',
        maxTouchPoints: 5,
        deviceId: '11111111-2222-4333-8444-555555555555',
      },
    })
    expect(parsed.path).toBe('/invoices')
    expect(parsed.signals.deviceType).toBe('mobile')
  })

  it('defaults signals when omitted', () => {
    const parsed = visitBeaconBodySchema.parse({ path: '/' })
    expect(parsed.signals).toEqual({})
    expect(deviceSignalsSchema.parse({ deviceType: 'desktop' }).deviceType).toBe('desktop')
  })
})

describe('access gate table helpers', () => {
  it('shortens fingerprints for table cells', () => {
    expect(shortFingerprint(null)).toBe('—')
    expect(shortFingerprint('short')).toBe('short')
    expect(shortFingerprint('0123456789abcdef', 10)).toBe('0123456789…')
  })

  it('formats event timestamps', () => {
    expect(accessEventWhen(null)).toBe('—')
    expect(accessEventWhen('2026-08-10T12:00:00.000Z')).toMatch(/2026/)
  })
})
