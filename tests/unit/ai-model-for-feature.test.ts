import { describe, expect, it } from 'vitest'
import { modelForFeature } from '../../server/services/ai-provider.service'
import type { AiProviderSettingsView } from '../../server/services/ai-provider.service'

function baseSettings(overrides: Partial<AiProviderSettingsView> = {}): AiProviderSettingsView {
  return {
    id: '00000000-0000-0000-0000-000000000001',
    provider: 'openrouter',
    enabled: true,
    hasApiKey: true,
    defaultModel: 'openai/gpt-4o-mini',
    serviceLogExtractionModel: null,
    invoiceDescriptionModel: null,
    platformHelpModel: null,
    aiAdministratorModel: null,
    serviceLogExtractionEnabled: true,
    invoiceDescriptionEnabled: true,
    platformHelpEnabled: true,
    aiAdministratorEnabled: true,
    dailySpendCapUsd: null,
    monthlySpendCapUsd: null,
    updatedAt: new Date(),
    ...overrides,
  }
}

describe('modelForFeature', () => {
  it('falls back to defaultModel when a task override is null', () => {
    const settings = baseSettings()
    expect(modelForFeature(settings, 'service_log_extraction')).toBe('openai/gpt-4o-mini')
    expect(modelForFeature(settings, 'invoice_description')).toBe('openai/gpt-4o-mini')
    expect(modelForFeature(settings, 'platform_help')).toBe('openai/gpt-4o-mini')
  })

  it('uses per-task model overrides when set', () => {
    const settings = baseSettings({
      serviceLogExtractionModel: 'openai/gpt-4o',
      invoiceDescriptionModel: 'anthropic/claude-3.5-sonnet',
      platformHelpModel: 'google/gemini-2.0-flash',
    })
    expect(modelForFeature(settings, 'service_log_extraction')).toBe('openai/gpt-4o')
    expect(modelForFeature(settings, 'invoice_description')).toBe('anthropic/claude-3.5-sonnet')
    expect(modelForFeature(settings, 'platform_help')).toBe('google/gemini-2.0-flash')
  })
})
