import { describe, expect, it } from 'vitest'
import {
  aiProviderSettingsAuditSnapshot,
  type AiProviderSettingsView,
} from '../../server/services/ai-provider.service'

describe('ai-provider admin helpers', () => {
  it('serializes settings audit snapshots with ISO dates', () => {
    const view: AiProviderSettingsView = {
      id: '00000000-0000-4000-8000-000000000001',
      provider: 'openrouter',
      enabled: true,
      hasApiKey: true,
      defaultModel: 'anthropic/claude-3.5-sonnet',
      serviceLogExtractionModel: null,
      invoiceDescriptionModel: null,
      platformHelpModel: null,
      serviceLogExtractionEnabled: true,
      invoiceDescriptionEnabled: true,
      aiAdministratorModel: null,
      platformHelpEnabled: true,
      aiAdministratorEnabled: true,
      dailySpendCapUsd: '2.0000',
      monthlySpendCapUsd: '30.0000',
      updatedAt: new Date('2026-08-03T12:00:00.000Z'),
    }

    const snapshot = aiProviderSettingsAuditSnapshot(view)
    expect(snapshot.updatedAt).toBe('2026-08-03T12:00:00.000Z')
    expect(JSON.stringify(snapshot)).toContain('anthropic/claude-3.5-sonnet')
  })
})
