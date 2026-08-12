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
    expect(accessEventDisplayLabel({ outcome: 'allowed' })).toBe('Access granted')
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
    })).toBe('Geofence blocked')
  })

  it('uses distinct colors per group', () => {
    const colors = new Set([
      accessEventDisplayColor({ outcome: 'allowed' }),
      accessEventDisplayColor({ outcome: 'login_failed' }),
      accessEventDisplayColor({ outcome: 'blocked', blockReason: 'geo_outside' }),
      accessEventDisplayColor({ outcome: 'blocked', blockReason: 'ip_banned' }),
    ])
    expect(colors.size).toBe(4)
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
