import { describe, expect, it } from 'vitest'
import { billingIntegrationsPatchSchema } from '../../shared/validators/billing-integrations'

describe('billingIntegrationsPatchSchema', () => {
  it('accepts a full billing settings save payload', () => {
    const result = billingIntegrationsPatchSchema.safeParse({
      vultrEnabled: true,
      vultrMonitoredInstanceIds: ['a1b2c3d4'],
      domainRenewals: [{
        name: 'example.com',
        renewalDate: '2027-08-04',
        renewalCost: 15.88,
      }],
      openrouterBillingEnabled: true,
    })
    expect(result.success).toBe(true)
  })

  it('accepts clearing domain renewals with an empty array', () => {
    const result = billingIntegrationsPatchSchema.safeParse({
      domainRenewals: [],
      openrouterBillingEnabled: false,
    })
    expect(result.success).toBe(true)
  })

  it('rejects incomplete domain renewal rows', () => {
    const result = billingIntegrationsPatchSchema.safeParse({
      domainRenewals: [{
        name: 'ab',
        renewalDate: 'bad',
        renewalCost: -1,
      }],
    })
    expect(result.success).toBe(false)
  })
})
