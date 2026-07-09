import { describe, expect, it } from 'vitest'
import {
  aiSuggestionStatusPill,
  formatAiAuditAction,
  pendingDescriptionSuggestion,
  pendingExtractionSuggestion,
} from '../../app/utils/ai-ui'

describe('ai-ui helpers', () => {
  it('finds pending extraction for file', () => {
    const suggestions = [{
      id: '1',
      aiJobId: 'j',
      featureType: 'service_log_extraction',
      status: 'pending' as const,
      originalContent: null,
      suggestedContent: { fileId: 'f1', complaint: 'Leak' },
      reviewedAt: null,
      createdAt: '2026-07-08',
    }]
    expect(pendingExtractionSuggestion(suggestions, 'f1')?.id).toBe('1')
    expect(pendingExtractionSuggestion(suggestions, 'f2')).toBeNull()
  })

  it('finds pending description for line', () => {
    const suggestions = [{
      id: '2',
      aiJobId: 'j',
      featureType: 'invoice_description',
      status: 'pending' as const,
      originalContent: { lineItemId: 'line-1', description: 'raw' },
      suggestedContent: { description: 'polished', lineItemId: 'line-1' },
      reviewedAt: null,
      createdAt: '2026-07-08',
    }]
    expect(pendingDescriptionSuggestion(suggestions, 'line-1')?.id).toBe('2')
    expect(pendingDescriptionSuggestion(suggestions, 'line-2')).toBeNull()
  })

  it('formats audit labels and status pills', () => {
    expect(formatAiAuditAction('ai.suggestion.accepted')).toBe('AI suggestion accepted')
    expect(aiSuggestionStatusPill('edited').label).toBe('Edited & applied')
  })
})
