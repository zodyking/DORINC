import { describe, expect, it } from 'vitest'
import {
  createOutsideGeoBypassToken,
  hashUserAgent,
  verifyOutsideGeoBypassToken,
} from '../../server/auth/outside-geo-bypass'
import { generateOutsideGeoCode, maskEmail } from '../../server/services/outside-geo-verify.service'
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

describe('outside geofence audit message', () => {
  it('includes the user name', () => {
    expect(formatAuditChangeMessage({
      action: 'auth.login.outside_geofence',
      actorName: 'Jordan Taylor',
    })).toBe('Jordan Taylor logged in outside geofence')
  })
})
