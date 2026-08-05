import { describe, expect, it } from 'vitest'
import {
  BILLING_PROVIDER_ACCOUNT_URLS,
  BILLING_PROVIDER_LABELS,
  billingProviderManageLabel,
  formatVultrInstanceStatus,
} from '../../app/utils/billing-ui'

describe('billing-ui helpers', () => {
  it('defines provider account login URLs', () => {
    expect(BILLING_PROVIDER_ACCOUNT_URLS.vultr).toMatch(/^https:\/\//)
    expect(BILLING_PROVIDER_ACCOUNT_URLS.namecheap).toMatch(/^https:\/\//)
    expect(BILLING_PROVIDER_ACCOUNT_URLS.openrouter).toMatch(/^https:\/\//)
  })

  it('builds manage account button labels', () => {
    expect(billingProviderManageLabel('vultr')).toBe('Manage Vultr account')
    expect(billingProviderManageLabel('namecheap')).toBe('Manage Namecheap account')
    expect(billingProviderManageLabel('openrouter')).toBe('Manage OpenRouter account')
  })

  it('keeps provider labels stable', () => {
    expect(BILLING_PROVIDER_LABELS.openrouter.category).toBe('Artificial intelligence')
  })

  it('formats Vultr instance status labels', () => {
    expect(formatVultrInstanceStatus('running')).toBe('Running')
    expect(formatVultrInstanceStatus('power_off')).toBe('Power Off')
  })
})
