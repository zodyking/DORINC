import { describe, expect, it } from 'vitest'
import { billingIntegrationsPatchSchema } from '../../shared/validators/billing-integrations'

describe('billingIntegrationsPatchSchema', () => {
  it('accepts manual Namecheap domains without API credentials', () => {
    const result = billingIntegrationsPatchSchema.safeParse({
      namecheapEnabled: true,
      namecheapManualDomains: [{
        name: 'example.com',
        renewalDate: '2027-08-04',
        renewalCost: 15.88,
      }],
      namecheapApiUser: '',
      namecheapApiKey: '',
      vultrApiKey: '',
    })
    expect(result.success).toBe(true)
  })

  it('rejects incomplete manual domain rows', () => {
    const result = billingIntegrationsPatchSchema.safeParse({
      namecheapManualDomains: [{
        name: 'ab',
        renewalDate: 'bad',
        renewalCost: -1,
      }],
    })
    expect(result.success).toBe(false)
  })
})
