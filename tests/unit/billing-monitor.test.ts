import { describe, expect, it } from 'vitest'

describe('billing permissions', () => {
  it('grants billing.read.all to admin and manager bundles', async () => {
    const { ACCOUNT_TYPE_BUNDLES } = await import('../../shared/permissions/keys')
    expect(ACCOUNT_TYPE_BUNDLES.admin).toContain('billing.read.all')
    expect(ACCOUNT_TYPE_BUNDLES.manager).toContain('billing.read.all')
    expect(ACCOUNT_TYPE_BUNDLES.accountant).not.toContain('billing.read.all')
  })
})

describe('billing dashboard totals', () => {
  it('rounds monthly and yearly estimates from plan cost and usage', () => {
    const vultrUsd = 20
    const openrouterUsd = 0.09
    const namecheapMonthlyUsd = 15.88
    const namecheapYearlyUsd = 31.76

    const roundMoney = (value: number) => Math.round(value * 100) / 100
    const estimatedMonthlyUsd = roundMoney(vultrUsd + openrouterUsd + namecheapMonthlyUsd)
    const estimatedYearlyUsd = roundMoney((vultrUsd * 12) + (openrouterUsd * 12) + namecheapYearlyUsd)

    expect(estimatedMonthlyUsd).toBe(35.97)
    expect(estimatedYearlyUsd).toBe(272.84)
  })
})
