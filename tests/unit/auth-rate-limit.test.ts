import { describe, expect, it } from 'vitest'
import {
  formatRateLimitCountdown,
  rateLimitMessage,
} from '../../app/utils/auth-rate-limit'
import {
  authErrorCode,
  authErrorRetryAfterSeconds,
} from '../../app/utils/auth-errors'

describe('auth rate limit helpers', () => {
  it('formats countdown as mm:ss', () => {
    expect(formatRateLimitCountdown(125)).toBe('2:05')
    expect(formatRateLimitCountdown(8)).toBe('8s')
  })

  it('builds scope-specific paused messages', () => {
    expect(rateLimitMessage('login', 90)).toBe('Too many sign-in attempts. Please wait.')
    expect(rateLimitMessage('verify_email', 30)).toContain('verification email')
    expect(rateLimitMessage('password_reset', 30)).toContain('password reset')
  })

  it('reads retryAfterSeconds from standard API errors', () => {
    const err = {
      data: {
        code: 'RATE_LIMITED',
        message: 'Too many requests — try again later',
        details: { retryAfterSeconds: 842, scope: 'login' },
      },
    }
    expect(authErrorCode(err)).toBe('RATE_LIMITED')
    expect(authErrorRetryAfterSeconds(err)).toBe(842)
  })

  it('treats a zero retry-after as already elapsed', () => {
    expect(authErrorRetryAfterSeconds({
      data: { code: 'RATE_LIMITED', details: { retryAfterSeconds: 0 } },
    })).toBeNull()
  })
})
