import { describe, expect, it } from 'vitest'
import {
  mapDomainRenewalsForDashboard,
  normalizeDomainRenewals,
} from '../../server/services/domain-renewals.service'

describe('domain renewals', () => {
  it('normalizes manual domain rows before save', () => {
    expect(normalizeDomainRenewals([
      { name: ' Example.COM ', renewalDate: '2027-08-04', renewalCost: 15.888 },
    ])).toEqual([
      { name: 'example.com', renewalDate: '2027-08-04', renewalCost: 15.89 },
    ])
  })

  it('maps saved rows for the billing dashboard', () => {
    const rows = mapDomainRenewalsForDashboard([
      { name: 'example.com', renewalDate: '2027-08-04', renewalCost: 15.88 },
    ])
    expect(rows).toHaveLength(1)
    expect(rows[0]?.name).toBe('example.com')
    expect(rows[0]?.renewalDate).toBe('2027-08-04')
    expect(rows[0]?.renewalCost).toBe(15.88)
    expect(rows[0]?.currency).toBe('USD')
  })
})
