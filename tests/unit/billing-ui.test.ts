import { describe, expect, it } from 'vitest'
import {
  BILLING_PROVIDER_ACCOUNT_URLS,
  BILLING_PROVIDER_LABELS,
  billingProviderManageLabel,
  buildBillingChartGeometry,
  formatCloudflarePrivacy,
  formatVultrCount,
  formatVultrInstanceStatus,
  formatVultrRam,
  formatYesNo,
} from '../../app/utils/billing-ui'

describe('billing-ui helpers', () => {
  it('defines provider account login URLs', () => {
    expect(BILLING_PROVIDER_ACCOUNT_URLS.vultr).toMatch(/^https:\/\//)
    expect(BILLING_PROVIDER_ACCOUNT_URLS.cloudflare).toMatch(/^https:\/\//)
    expect(BILLING_PROVIDER_ACCOUNT_URLS.openrouter).toMatch(/^https:\/\//)
  })

  it('builds manage account button labels', () => {
    expect(billingProviderManageLabel('vultr')).toBe('Manage Vultr account')
    expect(billingProviderManageLabel('cloudflare')).toBe('Manage Cloudflare account')
    expect(billingProviderManageLabel('openrouter')).toBe('Manage OpenRouter account')
  })

  it('keeps provider labels stable', () => {
    expect(BILLING_PROVIDER_LABELS.openrouter.category).toBe('Artificial intelligence')
    expect(BILLING_PROVIDER_LABELS.cloudflare.category).toBe('Domain provider')
  })

  it('formats Vultr instance status labels', () => {
    expect(formatVultrInstanceStatus('running')).toBe('Running')
    expect(formatVultrInstanceStatus('power_off')).toBe('Power Off')
  })

  it('formats Vultr vCPU counts', () => {
    expect(formatVultrCount(1, 'vCPU')).toBe('1 vCPU')
    expect(formatVultrCount(4, 'vCPU')).toBe('4 vCPUs')
  })

  it('formats Cloudflare privacy and yes/no helpers', () => {
    expect(formatCloudflarePrivacy('redaction')).toBe('WHOIS redaction')
    expect(formatYesNo(true)).toBe('Yes')
    expect(formatYesNo(false)).toBe('No')
  })

  it('builds chart geometry for outlook points', () => {
    const chart = buildBillingChartGeometry([
      { label: 'Jul', actualUsd: 20, projectedUsd: 21 },
      { label: 'Aug', actualUsd: 18, projectedUsd: 21 },
      { label: 'Sep', actualUsd: null, projectedUsd: 36 },
    ])
    expect(chart.actualPath).toContain('M')
    expect(chart.projectedPath).toContain('M')
    expect(chart.points).toHaveLength(3)
    expect(chart.yTicks.length).toBeGreaterThanOrEqual(2)
    expect(chart.yTicks[0]?.label).toMatch(/^\$/)
    expect(formatVultrRam(4096)).toBe('4 GB RAM')
  })
})

