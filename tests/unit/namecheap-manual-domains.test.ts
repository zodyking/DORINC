import { describe, expect, it } from 'vitest'
import {
  mapManualNamecheapDomains,
  mergeNamecheapDashboardDomains,
} from '../../server/services/namecheap-manual-domains.service'

describe('namecheap manual domains', () => {
  it('maps manual entries for the billing dashboard', () => {
    const rows = mapManualNamecheapDomains([
      { name: 'example.com', renewalDate: '2027-08-04', renewalCost: 15.88 },
    ])
    expect(rows).toHaveLength(1)
    expect(rows[0]?.name).toBe('example.com')
    expect(rows[0]?.renewalDate).toBe('2027-08-04')
    expect(rows[0]?.renewalCost).toBe(15.88)
    expect(rows[0]?.renewalCostStatus).toBe('ok')
    expect(rows[0]?.source).toBe('manual')
  })

  it('prefers manual entries over API duplicates', () => {
    const merged = mergeNamecheapDashboardDomains(
      [{ name: 'Example.com', renewalDate: '2027-01-01', renewalCost: 12 }],
      [{
        name: 'example.com',
        renewalDate: '2026-12-01',
        daysUntilRenewal: 10,
        autoRenew: true,
        premium: false,
        renewalCost: 20,
        renewalCostStatus: 'ok',
        currency: 'USD',
        source: 'api',
      }],
    )
    expect(merged).toHaveLength(1)
    expect(merged[0]?.renewalCost).toBe(12)
    expect(merged[0]?.source).toBe('manual')
  })
})
