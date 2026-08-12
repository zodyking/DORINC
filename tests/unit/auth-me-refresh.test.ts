import { describe, expect, it } from 'vitest'
import { AUTH_ME_FOCUS_MIN_GAP_MS, AUTH_ME_POLL_MS } from '../../shared/auth-me-refresh'

describe('auth me refresh cadence', () => {
  it('polls slowly enough that many signed-in tabs cannot starve the pool', () => {
    expect(AUTH_ME_POLL_MS).toBe(30_000)
    expect(AUTH_ME_FOCUS_MIN_GAP_MS).toBe(5_000)
    expect(AUTH_ME_FOCUS_MIN_GAP_MS).toBeLessThan(AUTH_ME_POLL_MS)
  })
})
