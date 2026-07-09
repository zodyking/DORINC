import { describe, expect, it } from 'vitest'
import {
  portalEstimateMatchesFilter,
  portalEstimateStatus,
} from '../../app/utils/portal-estimates-ui'

describe('portal-estimates-ui helpers (P3-03)', () => {
  it('formats estimate status pills', () => {
    expect(portalEstimateStatus('sent')).toEqual({
      cls: 'pill warn',
      label: 'Awaiting your response',
    })
    expect(portalEstimateStatus('approved')).toEqual({
      cls: 'pill ok',
      label: 'Approved',
    })
  })

  it('filters estimate list chips', () => {
    expect(portalEstimateMatchesFilter('sent', 'pending')).toBe(true)
    expect(portalEstimateMatchesFilter('approved', 'pending')).toBe(false)
    expect(portalEstimateMatchesFilter('approved', 'approved')).toBe(true)
    expect(portalEstimateMatchesFilter('converted', 'approved')).toBe(true)
    expect(portalEstimateMatchesFilter('rejected', 'rejected')).toBe(true)
  })
})
