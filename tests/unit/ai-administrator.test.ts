import { describe, expect, it } from 'vitest'
import {
  DELETION_REASON_WEAK_MESSAGE,
  SIMILAR_DELETION_REQUEST_LOOKBACK_MS,
  deletionReasonsLookSimilar,
  findSimilarDeletionRequest,
  looksLikeWeakDeletionReason,
  normalizeDeletionReasonForCompare,
  pendingDeletionIdsNeedingReview,
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
    expect(looksLikeWeakDeletionReason('test system')).toBe(true)
    expect(looksLikeWeakDeletionReason('testing the system')).toBe(true)
    expect(looksLikeWeakDeletionReason('just testing features')).toBe(true)
  })

  it('allows concise real deletion reasons that explain why', () => {
    expect(looksLikeWeakDeletionReason('Duplicate draft created for the wrong customer')).toBe(false)
    expect(looksLikeWeakDeletionReason('Created during training — please remove this test invoice')).toBe(false)
    expect(looksLikeWeakDeletionReason(
      'Was testing the system to ensure all features worked properly.',
    )).toBe(false)
  })

  it('detects similar deletion reasons', () => {
    expect(normalizeDeletionReasonForCompare('  Duplicate!! Draft.  ')).toBe('duplicate draft')
    expect(deletionReasonsLookSimilar(
      'Duplicate draft created for the wrong customer',
      'duplicate draft created for wrong customer',
    )).toBe(true)
    expect(deletionReasonsLookSimilar(
      'Duplicate draft created for the wrong customer',
      'Vehicle sold and no longer needs service history cleanup',
    )).toBe(false)
  })

  it('finds repeated same-record and similar-reason deletion requests', () => {
    const history = [
      {
        id: '11111111-1111-4111-8111-111111111111',
        entityType: 'invoice' as const,
        entityId: '22222222-2222-4222-8222-222222222222',
        entityLabel: 'INV-000010',
        status: 'rejected',
        reason: 'test system',
      },
      {
        id: '33333333-3333-4333-8333-333333333333',
        entityType: 'invoice' as const,
        entityId: '44444444-4444-4444-8444-444444444444',
        entityLabel: 'INV-000011',
        status: 'rejected',
        reason: 'Duplicate draft created for the wrong customer',
      },
    ]

    expect(findSimilarDeletionRequest({
      entityType: 'invoice',
      entityId: '22222222-2222-4222-8222-222222222222',
      reason: 'Was testing the system to ensure all features worked properly.',
    }, history)?.kind).toBe('same_record')

    expect(findSimilarDeletionRequest({
      entityType: 'invoice',
      entityId: '55555555-5555-4555-8555-555555555555',
      reason: 'duplicate draft created for wrong customer again',
    }, history)?.kind).toBe('similar_reason')

    expect(findSimilarDeletionRequest({
      entityType: 'customer',
      entityId: '55555555-5555-4555-8555-555555555555',
      reason: 'duplicate draft created for wrong customer again',
    }, history)).toBeNull()
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
    expect(DELETION_REASON_WEAK_MESSAGE).toMatch(/explain why/i)
  })

  it('looks back one hour for similar deletion requests', () => {
    expect(SIMILAR_DELETION_REQUEST_LOOKBACK_MS).toBe(60 * 60 * 1000)
  })

  it('catch-up picks oldest pending requests that lack an active review job', () => {
    expect(pendingDeletionIdsNeedingReview(
      ['a', 'b', 'c'],
      ['b'],
    )).toEqual(['a', 'c'])
    expect(pendingDeletionIdsNeedingReview(
      ['a', 'b'],
      ['a', 'b'],
    )).toEqual([])
    expect(pendingDeletionIdsNeedingReview(
      ['oldest', 'newest'],
      [],
    )).toEqual(['oldest', 'newest'])
  })
})
