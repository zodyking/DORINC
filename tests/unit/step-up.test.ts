// Unit tests for step-up verification (P3-08).
import { describe, expect, it } from 'vitest'
import {
  isStepUpValid,
  stepUpExpiresAt,
  STEP_UP_TTL_MS,
} from '../../server/services/step-up.service'

describe('step-up verification (P3-08)', () => {
  it('treats fresh verification as valid within TTL', () => {
    const now = Date.now()
    const verifiedAt = new Date(now - 60_000)
    expect(isStepUpValid(verifiedAt, now)).toBe(true)
    expect(stepUpExpiresAt(verifiedAt)?.getTime()).toBe(verifiedAt.getTime() + STEP_UP_TTL_MS)
  })

  it('rejects expired verification', () => {
    const now = Date.now()
    const verifiedAt = new Date(now - STEP_UP_TTL_MS - 1)
    expect(isStepUpValid(verifiedAt, now)).toBe(false)
    expect(stepUpExpiresAt(null)).toBeNull()
  })
})
