import { describe, expect, it } from 'vitest'
import {
  daysUntilIso,
  extractDomainExtension,
  mapCloudflareRegistration,
  sumCloudflareAnnualRenewals,
  sumCloudflareRenewalsInWindow,
} from '../../server/services/cloudflare-billing.service'

describe('cloudflare billing helpers', () => {
  it('maps registrar registration fields used on the billing page', () => {
    const mapped = mapCloudflareRegistration({
      domain_name: 'Example.COM',
      expires_at: '2027-01-15T10:00:00Z',
      created_at: '2025-01-15T10:00:00Z',
      auto_renew: true,
      locked: true,
      privacy_mode: 'redaction',
      status: 'active',
    }, 10.11, 'USD')

    expect(mapped).toEqual({
      domainName: 'example.com',
      expiresAt: '2027-01-15T10:00:00Z',
      registeredAt: '2025-01-15T10:00:00Z',
      autoRenew: true,
      locked: true,
      status: 'active',
      privacyMode: 'redaction',
      renewalCost: 10.11,
      currency: 'USD',
    })
  })

  it('extracts multi-level extensions', () => {
    expect(extractDomainExtension('shop.example.co.uk')).toBe('example.co.uk')
    expect(extractDomainExtension('example.com')).toBe('com')
  })

  it('computes days until expiry', () => {
    const now = Date.parse('2026-08-06T00:00:00.000Z')
    expect(daysUntilIso('2026-08-16T00:00:00.000Z', now)).toBe(10)
  })

  it('sums renewals inside a day window', () => {
    const total = sumCloudflareRenewalsInWindow([
      { daysUntilRenewal: 10, renewalCost: 10 },
      { daysUntilRenewal: 40, renewalCost: 20 },
      { daysUntilRenewal: 5, renewalCost: 5.555 },
    ], 30)
    expect(total).toBe(15.56)
  })

  it('sums all domain renewal prices for the yearly budget', () => {
    const total = sumCloudflareAnnualRenewals([
      { renewalCost: 15.88 },
      { renewalCost: 0 },
      { renewalCost: null },
      { renewalCost: 12.12 },
    ])
    expect(total).toBe(28)
  })
})
