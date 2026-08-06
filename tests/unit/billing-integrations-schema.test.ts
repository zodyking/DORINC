import { describe, expect, it } from 'vitest'
import { billingIntegrationsPatchSchema } from '../../shared/validators/billing-integrations'

describe('billingIntegrationsPatchSchema', () => {
  it('accepts a full Cloudflare billing settings save payload', () => {
    const result = billingIntegrationsPatchSchema.safeParse({
      vultrEnabled: true,
      vultrMonitoredInstanceIds: ['a1b2c3d4'],
      vultrUsername: 'ops@example.com',
      vultrPassword: 'secret-pass',
      cloudflareEnabled: true,
      cloudflareAccountId: 'ea95132c15732412d22c1476fa83f27a',
      cloudflareApiToken: 'cf-token-example-12345678',
      cloudflareUsername: 'admin@example.com',
      cloudflarePassword: 'cf-secret',
      openrouterBillingEnabled: true,
      openrouterUsername: 'ai@example.com',
      openrouterPassword: 'or-secret',
    })
    expect(result.success).toBe(true)
  })

  it('accepts disabling providers without credentials', () => {
    const result = billingIntegrationsPatchSchema.safeParse({
      cloudflareEnabled: false,
      openrouterBillingEnabled: false,
    })
    expect(result.success).toBe(true)
  })

  it('rejects incomplete Cloudflare account IDs', () => {
    const result = billingIntegrationsPatchSchema.safeParse({
      cloudflareAccountId: 'short',
    })
    expect(result.success).toBe(false)
  })
})
