import { describe, expect, it, vi } from 'vitest'
import { ensureBillingIntegrationsSchema } from '../../server/lib/ensure-billing-integrations-schema.mjs'

describe('ensureBillingIntegrationsSchema', () => {
  it('skips table creation when billing_integrations exists', async () => {
    const query = vi.fn()
      .mockResolvedValueOnce({ rows: [{ reg: 'billing_integrations' }] })
      .mockResolvedValue(undefined)
    const pool = { query }

    await expect(ensureBillingIntegrationsSchema(pool)).resolves.toBe(false)
    expect(query).toHaveBeenCalledTimes(5)
  })

  it('creates billing_integrations when missing', async () => {
    const query = vi.fn()
      .mockResolvedValueOnce({ rows: [{ reg: null }] })
      .mockResolvedValueOnce(undefined)
    const pool = { query }

    await expect(ensureBillingIntegrationsSchema(pool)).resolves.toBe(true)
    expect(String(query.mock.calls[1]?.[0])).toContain('CREATE TABLE IF NOT EXISTS "billing_integrations"')
    expect(String(query.mock.calls[1]?.[0])).toContain('cloudflare_enabled')
    expect(String(query.mock.calls[1]?.[0])).toContain('encrypted_cloudflare_api_token')
  })

  it('ensures cloudflare and credential columns when table already exists', async () => {
    const query = vi.fn()
      .mockResolvedValueOnce({ rows: [{ reg: 'billing_integrations' }] })
      .mockResolvedValue(undefined)
    const pool = { query }

    await expect(ensureBillingIntegrationsSchema(pool)).resolves.toBe(false)
    expect(String(query.mock.calls[1]?.[0])).toContain('domain_renewals')
    expect(String(query.mock.calls[3]?.[0])).toContain('DROP COLUMN IF EXISTS "namecheap_manual_domains"')
    expect(String(query.mock.calls[4]?.[0])).toContain('cloudflare_enabled')
    expect(String(query.mock.calls[4]?.[0])).toContain('encrypted_vultr_username')
  })
})
