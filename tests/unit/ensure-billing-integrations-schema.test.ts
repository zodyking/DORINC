import { describe, expect, it, vi } from 'vitest'
import { ensureBillingIntegrationsSchema } from '../../server/lib/ensure-billing-integrations-schema.mjs'

describe('ensureBillingIntegrationsSchema', () => {
  it('skips table creation when billing_integrations exists', async () => {
    const query = vi.fn()
      .mockResolvedValueOnce({ rows: [{ reg: 'billing_integrations' }] })
      .mockResolvedValueOnce(undefined)
    const pool = { query }

    await expect(ensureBillingIntegrationsSchema(pool)).resolves.toBe(false)
    expect(query).toHaveBeenCalledTimes(2)
  })

  it('creates billing_integrations when missing', async () => {
    const query = vi.fn()
      .mockResolvedValueOnce({ rows: [{ reg: null }] })
      .mockResolvedValueOnce(undefined)
    const pool = { query }

    await expect(ensureBillingIntegrationsSchema(pool)).resolves.toBe(true)
    expect(query).toHaveBeenCalledTimes(2)
    expect(String(query.mock.calls[1]?.[0])).toContain('CREATE TABLE IF NOT EXISTS "billing_integrations"')
    expect(String(query.mock.calls[1]?.[0])).toContain('namecheap_manual_domains')
  })

  it('adds manual domain column when table already exists', async () => {
    const query = vi.fn()
      .mockResolvedValueOnce({ rows: [{ reg: 'billing_integrations' }] })
      .mockResolvedValueOnce(undefined)
    const pool = { query }

    await expect(ensureBillingIntegrationsSchema(pool)).resolves.toBe(false)
    expect(String(query.mock.calls[1]?.[0])).toContain('namecheap_manual_domains')
  })
})
