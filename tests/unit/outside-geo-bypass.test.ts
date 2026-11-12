import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import {
  createOutsideGeoBypassToken,
  hashUserAgent,
  verifyOutsideGeoBypassToken,
} from '../../server/auth/outside-geo-bypass'
import {
  generateOutsideGeoCode,
  identityFromUser,
  maskEmail,
  rankKnownOutsideGeoMatch,
} from '../../server/services/outside-geo-verify.service'
import { formatAuditChangeMessage } from '../../shared/audit-messages'

describe('outside geo bypass token', () => {
  it('round-trips a bypass for user/ip/device', () => {
    process.env.SESSION_SECRET = 'test-session-secret-for-outside-geo-bypass'
    const token = createOutsideGeoBypassToken({
      userId: 'user-1',
      ipAddress: '203.0.113.10',
      userAgent: 'Mozilla/5.0 TestBrowser',
    })
    const parsed = verifyOutsideGeoBypassToken(token)
    expect(parsed?.userId).toBe('user-1')
    expect(parsed?.ipAddress).toBe('203.0.113.10')
    expect(parsed?.userAgentHash).toBe(hashUserAgent('Mozilla/5.0 TestBrowser'))
  })

  it('rejects tampered tokens', () => {
    process.env.SESSION_SECRET = 'test-session-secret-for-outside-geo-bypass'
    const token = createOutsideGeoBypassToken({
      userId: 'user-1',
      ipAddress: '203.0.113.10',
      userAgent: 'Mozilla/5.0',
    })
    const tampered = `${token.slice(0, -4)}aaaa`
    expect(verifyOutsideGeoBypassToken(tampered)).toBeNull()
  })

})

describe('outside geo code helpers', () => {
  it('generates a 6-digit code', () => {
    const code = generateOutsideGeoCode()
    expect(code).toMatch(/^\d{6}$/)
  })

  it('masks email addresses', () => {
    expect(maskEmail('jordan@example.com')).toBe('jo****@example.com')
  })
})

describe('outside geo identity matching', () => {
  it('never ranks a user-agent-only match', () => {
    const ua = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/120.0.0.0'
    expect(rankKnownOutsideGeoMatch(
      { ip: '8.8.8.8', userAgent: ua, deviceId: null },
      { ipAddress: '203.0.113.10', userAgent: ua, deviceId: null },
    )).toBe(0)
  })

  it('ranks IP and device matches', () => {
    expect(rankKnownOutsideGeoMatch(
      { ip: '203.0.113.10', userAgent: 'UA', deviceId: 'dev-1' },
      { ipAddress: '203.0.113.10', userAgent: 'UA', deviceId: 'dev-1' },
    )).toBe(5)
    expect(rankKnownOutsideGeoMatch(
      { ip: '203.0.113.10', userAgent: null, deviceId: null },
      { ipAddress: '203.0.113.10', userAgent: 'other', deviceId: null },
    )).toBe(2)
  })

  it('builds a challenge identity from the signed-in user', () => {
    const identity = identityFromUser({
      id: 'user-1',
      name: 'Brandon King',
      email: 'brandon@example.com',
    })
    expect(identity.userId).toBe('user-1')
    expect(identity.userEmail).toBe('brandon@example.com')
  })

  it('emails the authenticated user on login, not a guessed IP/UA identity', () => {
    const login = readFileSync(resolve('server/api/auth/login.post.ts'), 'utf8')
    expect(login).toContain('identityFromUser(result.user)')
    expect(login).not.toContain('findKnownOutsideGeoIdentity')

    const complete = readFileSync(resolve('server/api/auth/complete-login.post.ts'), 'utf8')
    expect(complete).toContain('identityFromUser(resolved.user)')
    expect(complete).not.toContain('findKnownOutsideGeoIdentity')
  })
})

describe('outside geofence audit message', () => {
  it('includes the user name', () => {
    expect(formatAuditChangeMessage({
      action: 'auth.login.outside_geofence',
      actorName: 'Jordan Taylor',
    })).toBe('Jordan Taylor logged in outside geofence')
  })
})
