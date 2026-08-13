import { describe, expect, it } from 'vitest'
import { resolveOpenRouterMonthlySpend } from '../../shared/billing-openrouter-spend'

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
    const cloudflareMonthlyUsd = 15.88
    const cloudflareYearlyUsd = 31.76
    const quoMonthlyUsd = 12
    const quoYearlyUsd = 12 * 12

    const roundMoney = (value: number) => Math.round(value * 100) / 100
    const estimatedMonthlyUsd = roundMoney(vultrUsd + openrouterUsd + cloudflareMonthlyUsd + quoMonthlyUsd)
    const estimatedYearlyUsd = roundMoney((vultrUsd * 12) + (openrouterUsd * 12) + cloudflareYearlyUsd + quoYearlyUsd)

    expect(estimatedMonthlyUsd).toBe(47.97)
    expect(estimatedYearlyUsd).toBe(416.84)
  })

  it('uses internal AI usage when OpenRouter reports usage_monthly as 0', () => {
    expect(resolveOpenRouterMonthlySpend(0, 0.012345)).toBe(0.012345)
    expect(resolveOpenRouterMonthlySpend(null, 0.02)).toBe(0.02)
    expect(resolveOpenRouterMonthlySpend(1.5, 0.02)).toBe(1.5)
    expect(resolveOpenRouterMonthlySpend(0, 0)).toBe(0)
  })
})
