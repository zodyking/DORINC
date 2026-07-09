export interface AiSuggestionRow {
  id: string
  aiJobId: string
  featureType: string
  status: 'pending' | 'accepted' | 'edited' | 'rejected'
  originalContent: Record<string, unknown> | null
  suggestedContent: Record<string, unknown>
  reviewedAt: string | null
  createdAt: string
}

export interface DraftLineExtract {
  description: string
  qty?: string | null
  rate?: string | null
  amount?: string | null
}

export interface ExtractionSuggestionContent {
  complaint?: string | null
  internalNotes?: string | null
  draftLineItems?: DraftLineExtract[]
  fileId?: string
}

export function pendingExtractionSuggestion(
  suggestions: AiSuggestionRow[],
  fileId?: string | null,
): AiSuggestionRow | null {
  const pending = suggestions.filter(s => s.status === 'pending' && s.featureType === 'service_log_extraction')
  if (!fileId) return pending[0] ?? null
  return pending.find((s) => {
    const content = s.suggestedContent as ExtractionSuggestionContent
    return content.fileId === fileId || !content.fileId
  }) ?? null
}

export function pendingDescriptionSuggestion(
  suggestions: AiSuggestionRow[],
  lineItemId: string,
): AiSuggestionRow | null {
  return suggestions.find((s) => {
    if (s.status !== 'pending' || s.featureType !== 'invoice_description') return false
    const orig = s.originalContent?.lineItemId ?? s.suggestedContent.lineItemId
    return orig === lineItemId
  }) ?? null
}

export function aiSuggestionStatusPill(status: AiSuggestionRow['status']): { cls: string, label: string } {
  switch (status) {
    case 'pending': return { cls: 'pill warn', label: 'Pending review' }
    case 'accepted': return { cls: 'pill ok', label: 'Accepted' }
    case 'edited': return { cls: 'pill info', label: 'Edited & applied' }
    case 'rejected': return { cls: 'pill gray', label: 'Rejected' }
  }
}

export function formatAiAuditAction(action: string): string {
  if (action === 'ai.extraction.queued') return 'AI extraction queued'
  if (action === 'ai.description.queued') return 'AI description queued'
  if (action === 'ai.suggestion.accepted') return 'AI suggestion accepted'
  if (action === 'ai.suggestion.edited') return 'AI suggestion edited'
  if (action === 'ai.suggestion.rejected') return 'AI suggestion rejected'
  return action.replace(/\./g, ' ')
}
