import { describe, expect, it } from 'vitest'
import { billingIntegrationsPatchSchema } from '../../shared/validators/billing-integrations'

describe('billingIntegrationsPatchSchema', () => {
  it('accepts manual domain renewals', () => {
    const result = billingIntegrationsPatchSchema.safeParse({
      domainRenewals: [{
        name: 'example.com',
        renewalDate: '2027-08-04',
        renewalCost: 15.88,
      }],
      vultrApiKey: '',
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
