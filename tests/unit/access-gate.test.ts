import { describe, expect, it } from 'vitest'
import { evaluateAccessDecision } from '../../server/services/access-gate.service'
import { DEFAULT_ACCESS_GATE_SETTINGS, type AccessGateSettings } from '../../shared/validators/access-gate'

function settings(overrides: Partial<AccessGateSettings>): AccessGateSettings {
  return { ...DEFAULT_ACCESS_GATE_SETTINGS, ...overrides }
}

const areaSquare = [
  { lat: 40, lng: -75 },
  { lat: 40, lng: -73 },
  { lat: 42, lng: -73 },
  { lat: 42, lng: -75 },
]

describe('evaluateAccessDecision', () => {
  it('allows everything when disabled', () => {
    const s = settings({ enabled: false, blockMode: 'both', bannedIps: ['1.2.3.4'] })
    expect(evaluateAccessDecision(s, { ip: '1.2.3.4', coords: null }).blocked).toBe(false)
  })

  it('allows everything when block mode is off even if enabled', () => {
    const s = settings({ enabled: true, blockMode: 'off', bannedIps: ['1.2.3.4'] })
    expect(evaluateAccessDecision(s, { ip: '1.2.3.4', coords: null }).blocked).toBe(false)
  })

  it('blocks banned IPs in ip mode', () => {
    const s = settings({ enabled: true, blockMode: 'ip', bannedIps: ['1.2.3.4'] })
    const decision = evaluateAccessDecision(s, { ip: '1.2.3.4', coords: null })
    expect(decision.blocked).toBe(true)
    expect(decision.reason).toBe('ip_banned')
  })

  it('does not block non-banned IPs in ip mode', () => {
    const s = settings({ enabled: true, blockMode: 'ip', bannedIps: ['1.2.3.4'] })
    expect(evaluateAccessDecision(s, { ip: '9.9.9.9', coords: null }).blocked).toBe(false)
  })

  it('blocks coordinates outside the geofence in geo mode', () => {
    const s = settings({ enabled: true, blockMode: 'geo', allowedPolygon: areaSquare })
    const decision = evaluateAccessDecision(s, { ip: '9.9.9.9', coords: { lat: 50, lng: -74 } })
    expect(decision.blocked).toBe(true)
    expect(decision.reason).toBe('geo_outside')
  })

  it('allows coordinates inside the geofence', () => {
    const s = settings({ enabled: true, blockMode: 'geo', allowedPolygon: areaSquare })
    expect(evaluateAccessDecision(s, { ip: '9.9.9.9', coords: { lat: 41, lng: -74 } }).blocked).toBe(false)
  })

  it('fails closed when coordinates are unknown in geo mode', () => {
    const s = settings({ enabled: true, blockMode: 'geo', allowedPolygon: areaSquare })
    const decision = evaluateAccessDecision(s, { ip: '9.9.9.9', coords: null })
    expect(decision.blocked).toBe(true)
    expect(decision.reason).toBe('geo_unknown')
  })

  it('skips geo when coordinates are unknown if strictGeo is false', () => {
    const s = settings({ enabled: true, blockMode: 'geo', allowedPolygon: areaSquare })
    expect(evaluateAccessDecision(s, { ip: '9.9.9.9', coords: null }, { strictGeo: false }).blocked).toBe(false)
  })

  it('enforces both ip and geo in both mode', () => {
    const s = settings({ enabled: true, blockMode: 'both', bannedIps: ['1.2.3.4'], allowedPolygon: areaSquare })
    expect(evaluateAccessDecision(s, { ip: '1.2.3.4', coords: { lat: 41, lng: -74 } }).reason).toBe('ip_banned')
    expect(evaluateAccessDecision(s, { ip: '9.9.9.9', coords: { lat: 50, lng: -74 } }).reason).toBe('geo_outside')
    expect(evaluateAccessDecision(s, { ip: '9.9.9.9', coords: { lat: 41, lng: -74 } }).blocked).toBe(false)
  })

  it('does not geofence with fewer than 3 polygon points', () => {
    const s = settings({ enabled: true, blockMode: 'geo', allowedPolygon: [{ lat: 40, lng: -75 }, { lat: 41, lng: -74 }] })
    expect(evaluateAccessDecision(s, { ip: '9.9.9.9', coords: { lat: 0, lng: 0 } }).blocked).toBe(false)
  })
})
