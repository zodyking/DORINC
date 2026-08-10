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
  confidence?: number | null
  matchedSheetItemId?: string | null
  sourcePageIndex?: number | null
  sourceFileId?: string | null
  pageType?: string | null
  checkMark?: { x: number, y: number } | null
}

export interface ExtractionCheckMark {
  fileId: string
  x: number
  y: number
  description?: string
  matchedSheetItemId?: string | null
  confidence?: number | null
}

export interface ExtractionSuggestionContent {
  complaint?: string | null
  internalNotes?: string | null
  draftLineItems?: DraftLineExtract[]
  checkMarks?: ExtractionCheckMark[]
  fileId?: string
}

/** Build photo overlay marks from accepted draft lines (and optional checkMarks array). */
export function extractionCheckMarksForFile(
  fileId: string | null | undefined,
  draftLineItems?: DraftLineExtract[] | null,
  checkMarks?: ExtractionCheckMark[] | null,
  pageIndex?: number | null,
): ExtractionCheckMark[] {
  if (!fileId) return []
  const fromArray = (checkMarks ?? []).filter(mark => mark.fileId === fileId && Number.isFinite(mark.x) && Number.isFinite(mark.y))
  if (fromArray.length) return fromArray

  const fromLines: ExtractionCheckMark[] = []
  for (const line of draftLineItems ?? []) {
    const mark = line.checkMark
    if (!mark || !Number.isFinite(mark.x) || !Number.isFinite(mark.y)) continue
    const matchesFile = line.sourceFileId
      ? line.sourceFileId === fileId
      : pageIndex != null && line.sourcePageIndex === pageIndex
    if (!matchesFile) continue
    fromLines.push({
      fileId,
      x: mark.x,
      y: mark.y,
      description: line.description,
      matchedSheetItemId: line.matchedSheetItemId,
      confidence: line.confidence,
    })
  }
  return fromLines
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
    if ((s.suggestedContent as { kind?: string }).kind === 'invoice_line_audit') return false
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
