import { describe, expect, it } from 'vitest'
import { createPendingLoginToken, verifyPendingLoginToken } from '../../server/auth/pending-login'

describe('pending login token', () => {
  it('round-trips a session token', () => {
    process.env.SESSION_SECRET = 'test-session-secret-for-pending-login-token'
    const sessionToken = 'opaque-session-token-value'
    const token = createPendingLoginToken(sessionToken)
    expect(verifyPendingLoginToken(token)).toBe(sessionToken)
  })

  it('rejects tampered tokens', () => {
    process.env.SESSION_SECRET = 'test-session-secret-for-pending-login-token'
    const token = createPendingLoginToken('session-abc')
    const tampered = `${token.slice(0, -4)}aaaa`
    expect(verifyPendingLoginToken(tampered)).toBeNull()
  })
})
