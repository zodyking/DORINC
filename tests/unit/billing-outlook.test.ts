import { describe, expect, it } from 'vitest'
import { buildBillingOutlook } from '../../server/services/billing-outlook.service'

describe('buildBillingOutlook', () => {
  it('builds past actuals and future projections', () => {
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
    expect(july?.projectedUsd).toBeNull()

    const august = points.find(p => p.key === '2026-08')
    expect(august?.projectedUsd).toBe(21)

    const september = points.find(p => p.key === '2026-09')
    expect(september?.actualUsd).toBeNull()
    expect(september?.projectedUsd).toBe(36.88)
  })
})
