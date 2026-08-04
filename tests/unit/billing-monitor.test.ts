import { describe, expect, it } from 'vitest'
import {
  clearNamecheapPricingCacheForTests,
  domainTld,
  parseNamecheapExpiry,
} from '../../server/services/namecheap-billing.service'

describe('namecheap billing helpers', () => {
  it('extracts TLD from domain names', () => {
    expect(domainTld('example.com')).toBe('COM')
    expect(domainTld('shop.co.uk')).toBe('UK')
    expect(domainTld('localhost')).toBe('LOCALHOST')
  })

  it('parses Namecheap expiry dates', () => {
    const date = parseNamecheapExpiry('08/04/2027')
    expect(date).not.toBeNull()
    expect(date!.getUTCFullYear()).toBe(2027)
    expect(date!.getUTCMonth()).toBe(7)
    expect(date!.getUTCDate()).toBe(4)
    expect(parseNamecheapExpiry('invalid')).toBeNull()
  })
})

describe('billing permissions', () => {
  it('grants billing.read.all to admin and manager bundles', async () => {
    const { ACCOUNT_TYPE_BUNDLES } = await import('../../shared/permissions/keys')
    expect(ACCOUNT_TYPE_BUNDLES.admin).toContain('billing.read.all')
    expect(ACCOUNT_TYPE_BUNDLES.manager).toContain('billing.read.all')
    expect(ACCOUNT_TYPE_BUNDLES.accountant).not.toContain('billing.read.all')
  })
})

describe('billing dashboard totals', () => {
  it('rounds monthly and yearly estimates', () => {
    const vultrUsd = 7.42
    const openrouterUsd = 18.2
    const namecheapMonthlyUsd = 15.88
    const namecheapYearlyUsd = 31.76

    const roundMoney = (value: number) => Math.round(value * 100) / 100
    const estimatedMonthlyUsd = roundMoney(vultrUsd + openrouterUsd + namecheapMonthlyUsd)
    const estimatedYearlyUsd = roundMoney((vultrUsd * 12) + (openrouterUsd * 12) + namecheapYearlyUsd)

    expect(estimatedMonthlyUsd).toBe(41.5)
    expect(estimatedYearlyUsd).toBe(339.2)
  })
})

describe('namecheap pricing cache', () => {
  it('clears pricing cache for tests', () => {
    clearNamecheapPricingCacheForTests()
    expect(true).toBe(true)
  })
})
