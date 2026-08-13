import { describe, expect, it } from 'vitest'
import {
  daysUntilQuoPaymentDate,
  nextQuoPaymentDate,
  quoMonthlyRecurringUsd,
  quoYearlyRecurringUsd,
} from '../../shared/billing-quo'

describe('billing-quo monthly recurring helpers', () => {
  it('rolls a past payment day forward to the next monthly due date', () => {
    const now = new Date('2026-08-13T16:00:00.000Z')
    expect(nextQuoPaymentDate('2026-08-04', now)).toBe('2026-09-04')
    expect(nextQuoPaymentDate('2026-07-04', now)).toBe('2026-09-04')
    expect(nextQuoPaymentDate('2025-08-04', now)).toBe('2026-09-04')
  })

  it('keeps today and future anchors', () => {
    const now = new Date('2026-08-13T16:00:00.000Z')
    expect(nextQuoPaymentDate('2026-08-13', now)).toBe('2026-08-13')
    expect(nextQuoPaymentDate('2026-09-04', now)).toBe('2026-09-04')
  })

  it('clamps end-of-month anchors into shorter months', () => {
    const now = new Date('2026-01-15T12:00:00.000Z')
    expect(nextQuoPaymentDate('2026-01-31', now)).toBe('2026-01-31')
    expect(nextQuoPaymentDate('2025-12-31', now)).toBe('2026-01-31')
    // After Jan 31, next is Feb 28 in 2026.
    expect(nextQuoPaymentDate('2026-01-31', new Date('2026-02-01T12:00:00.000Z'))).toBe('2026-02-28')
  })

  it('counts days until the next payment', () => {
    const now = new Date('2026-08-13T16:00:00.000Z')
    expect(daysUntilQuoPaymentDate('2026-09-04', now)).toBe(22)
    expect(daysUntilQuoPaymentDate('2026-08-13', now)).toBe(0)
  })

  it('treats amount as monthly run-rate and yearly × 12', () => {
    expect(quoMonthlyRecurringUsd(23.89)).toBe(23.89)
    expect(quoYearlyRecurringUsd(23.89)).toBe(286.68)
    expect(quoMonthlyRecurringUsd(null)).toBe(0)
    expect(quoYearlyRecurringUsd(0)).toBe(0)
  })
})
