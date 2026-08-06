import { describe, expect, it } from 'vitest'
import { buildBillingOutlook } from '../../server/services/billing-outlook.service'

describe('buildBillingOutlook', () => {
  it('builds past actuals and expected spend for every month in the year window', () => {
    const now = new Date('2026-08-15T12:00:00.000Z')
    const points = buildBillingOutlook({
      vultrPlanMonthly: 20,
      openrouterMonthly: 1,
      vultrInvoices: [
        { date: '2026-07-10T00:00:00.000Z', amount: 19.5 },
        { date: '2026-07-20T00:00:00.000Z', amount: 0.5 },
      ],
      openrouterUsage: [
        { date: '2026-07-12T00:00:00.000Z', amount: 0.25 },
      ],
      domainRenewals: [
        { expiresAt: '2026-09-05T00:00:00.000Z', renewalCost: 15.88 },
      ],
      now,
    })

    expect(points).toHaveLength(12)
    const july = points.find(p => p.key === '2026-07')
    expect(july?.actualUsd).toBe(20.25)
    expect(july?.projectedUsd).toBe(21)

    const august = points.find(p => p.key === '2026-08')
    expect(august?.projectedUsd).toBe(21)

    const september = points.find(p => p.key === '2026-09')
    expect(september?.actualUsd).toBeNull()
    expect(september?.projectedUsd).toBe(36.88)

    // Expected line is continuous across the year window (no null gaps).
    expect(points.every(p => p.projectedUsd != null)).toBe(true)
  })

  it('attributes domain renewals inside the full 12-month window', () => {
    const now = new Date('2026-08-15T12:00:00.000Z')
    const points = buildBillingOutlook({
      vultrPlanMonthly: 10,
      openrouterMonthly: 0,
      vultrInvoices: [],
      openrouterUsage: [],
      domainRenewals: [
        { expiresAt: '2026-04-01T00:00:00.000Z', renewalCost: 12 },
        { expiresAt: '2027-01-10T00:00:00.000Z', renewalCost: 18 },
      ],
      now,
    })

    expect(points.find(p => p.key === '2026-04')?.projectedUsd).toBe(22)
    expect(points.find(p => p.key === '2027-01')?.projectedUsd).toBe(28)
  })
})
