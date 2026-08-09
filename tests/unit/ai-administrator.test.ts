import { describe, expect, it } from 'vitest'
import {
  DELETION_REASON_WEAK_MESSAGE,
  looksLikeWeakDeletionReason,
} from '../../server/services/ai-administrator.service'
import { modelForFeature } from '../../server/services/ai-provider.service'
import type { AiProviderSettingsView } from '../../server/services/ai-provider.service'
import { aiFeatureLabel } from '../../app/utils/admin-panel-ui'

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

describe('ai administrator helpers', () => {
  it('flags filler deletion reasons', () => {
    expect(looksLikeWeakDeletionReason('asdfasdfas')).toBe(true)
    expect(looksLikeWeakDeletionReason('test test test')).toBe(true)
    expect(looksLikeWeakDeletionReason('delete please')).toBe(true)
    expect(looksLikeWeakDeletionReason('xxxxxxxxxx')).toBe(true)
  })

  it('allows concise real deletion reasons', () => {
    expect(looksLikeWeakDeletionReason('Duplicate draft created for the wrong customer')).toBe(false)
    expect(looksLikeWeakDeletionReason('Created during training — please remove this test invoice')).toBe(false)
  })

  it('uses the AI Administrator model override', () => {
    expect(modelForFeature(baseSettings({
      aiAdministratorModel: 'anthropic/claude-3.5-sonnet',
    },), 'ai_administrator')).toBe('anthropic/claude-3.5-sonnet')
    expect(modelForFeature(baseSettings(), 'ai_administrator')).toBe('openai/gpt-4o-mini')
  })

  it('labels the administrator feature in the control panel usage list', () => {
    expect(aiFeatureLabel('ai_administrator')).toBe('Administrator')
    expect(aiFeatureLabel('deletion_request_ai_review')).toBe('Deletion review')
    expect(DELETION_REASON_WEAK_MESSAGE).toMatch(/more descriptive reason/i)
  })
})
