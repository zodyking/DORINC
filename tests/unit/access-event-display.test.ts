import { describe, expect, it } from 'vitest'
import {
  accessEventDisplayColor,
  accessEventDisplayGroup,
  accessEventDisplayLabel,
  accessEventUserLabel,
  parseAccessBlockReason,
  parseAccessDisplayGroup,
} from '../../shared/access-event-display'

describe('access event display groups', () => {
  it('maps granted outcomes', () => {
    expect(accessEventDisplayGroup({ outcome: 'allowed' })).toBe('access_granted')
    expect(accessEventDisplayGroup({ outcome: 'login_success' })).toBe('access_granted')
    expect(accessEventDisplayLabel({ outcome: 'allowed' })).toBe('Access Granted')
    expect(accessEventDisplayLabel({ outcome: 'login_failed' })).toBe('Fail')
  })

  it('maps credential failures to Fail', () => {
    expect(accessEventDisplayGroup({ outcome: 'login_failed' })).toBe('fail')
    expect(accessEventDisplayLabel({ outcome: 'login_failed' })).toBe('Fail')
  })

  it('maps geofence blocks separately from IP bans', () => {
    expect(accessEventDisplayGroup({
      outcome: 'blocked',
      blockReason: 'geo_outside',
    })).toBe('geofence_blocked')
    expect(accessEventDisplayGroup({
      outcome: 'blocked',
      blockReason: 'geo_unknown',
    })).toBe('geofence_blocked')
    expect(accessEventDisplayGroup({
      outcome: 'blocked',
      blockReason: 'ip_banned',
    })).toBe('blocked')
    expect(accessEventDisplayGroup({
      outcome: 'blocked',
      blockReason: null,
    })).toBe('blocked')
    expect(accessEventDisplayLabel({
      outcome: 'blocked',
      blockReason: 'geo_outside',
    })).toBe('Geo Blocked')
    expect(accessEventDisplayLabel({
      outcome: 'blocked',
      blockReason: 'ip_banned',
    })).toBe('Blocked')
  })

  it('treats /auth/access-restricted visits as Geo Blocked even if recorded allowed', () => {
    expect(accessEventDisplayGroup({
      outcome: 'allowed',
      path: '/auth/access-restricted',
    })).toBe('geofence_blocked')
    expect(accessEventDisplayGroup({
      outcome: 'allowed',
      path: '/auth/verify-location?sent=1',
    })).toBe('geofence_blocked')
    expect(accessEventDisplayGroup({
      outcome: 'allowed',
      path: '/auth/access-restricted',
      blockReason: 'ip_banned',
    })).toBe('blocked')
    expect(accessEventDisplayLabel({
      outcome: 'allowed',
      path: '/auth/access-restricted',
    })).toBe('Geo Blocked')
  })

  it('keeps normal allowed visits as Access Granted', () => {
    expect(accessEventDisplayGroup({
      outcome: 'allowed',
      path: '/dashboard',
    })).toBe('access_granted')
  })

  it('uses Access Granted green and Geo Blocked purple', () => {
    expect(accessEventDisplayColor({ outcome: 'allowed' })).toBe('#16a34a')
    expect(accessEventDisplayColor({ outcome: 'login_failed' })).toBe('#f59e0b')
    expect(accessEventDisplayColor({
      outcome: 'blocked',
      blockReason: 'geo_outside',
    })).toBe('#4f46e5')
    expect(accessEventDisplayColor({
      outcome: 'blocked',
      blockReason: 'ip_banned',
    })).toBe('#dc2626')
  })

  it('formats known users', () => {
    expect(accessEventUserLabel({ userName: 'Alex', userEmail: 'a@x.com' })).toBe('Alex · a@x.com')
    expect(accessEventUserLabel({ userName: null, userEmail: 'a@x.com' })).toBe('a@x.com')
    expect(accessEventUserLabel({})).toBe('—')
  })

  it('parses reason and group query values', () => {
    expect(parseAccessBlockReason('ip_banned')).toBe('ip_banned')
    expect(parseAccessBlockReason('nope')).toBeNull()
    expect(parseAccessDisplayGroup('geofence_blocked')).toBe('geofence_blocked')
    expect(parseAccessDisplayGroup('Login')).toBeUndefined()
  })
})
