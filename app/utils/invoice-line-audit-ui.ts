import type { AiSuggestionRow } from './ai-ui'
import type { InvoiceLineAuditContent } from '../../shared/validators/ai'

export function isLineAuditSuggestion(suggestion: AiSuggestionRow): boolean {
  return (suggestion.suggestedContent as { kind?: string }).kind === 'invoice_line_audit'
}

export function parseLineAuditContent(suggestion: AiSuggestionRow): InvoiceLineAuditContent | null {
  if (!isLineAuditSuggestion(suggestion)) return null
  const content = suggestion.suggestedContent as InvoiceLineAuditContent
  return content?.kind === 'invoice_line_audit' ? content : null
}

export function latestLineAuditSuggestion(suggestions: AiSuggestionRow[]): AiSuggestionRow | null {
  return suggestions.find(s => isLineAuditSuggestion(s)) ?? null
}

export function pendingLineAuditSuggestion(suggestions: AiSuggestionRow[]): AiSuggestionRow | null {
  return suggestions.find(s => s.status === 'pending' && isLineAuditSuggestion(s)) ?? null
}

export function lineAuditHasIssues(content: InvoiceLineAuditContent): boolean {
  return content.summary.issuesFound > 0
}

export function lineAuditIssueLines(content: InvoiceLineAuditContent) {
  return content.lines.filter(l => l.status === 'needs_fix')
}

const LINE_AUDIT_REVIEW_ACTIONS = new Set([
  'ai.line_audit.completed',
  'ai.line_audit.reviewed',
])

/** Service-log invoices stay on Save until the first line audit completes. */
export function invoiceNeedsInitialServiceLogReview(opts: {
  creationSource?: string | null
  status: string
  historyActions: string[]
  locallyCleared?: boolean
}): boolean {
  if (opts.locallyCleared) return false
  if (opts.creationSource !== 'service_log') return false
  if (opts.status !== 'draft') return false
  return !opts.historyActions.some(action => LINE_AUDIT_REVIEW_ACTIONS.has(action))
}

/** Run line audit on save only when the editor changed or a converted service log still needs first review. */
export function shouldRunLineAuditBeforeSave(opts: {
  isDirty: boolean
  creationSource?: string | null
  status: string
  historyActions: string[]
  locallyCleared?: boolean
}): boolean {
  if (opts.isDirty) return true
  return invoiceNeedsInitialServiceLogReview(opts)
}

export async function pollAiJobUntilDone(
  jobId: string,
  opts: { intervalMs?: number, timeoutMs?: number } = {},
): Promise<{ status: string, outputPayload: Record<string, unknown> | null, lastError: string | null }> {
  const intervalMs = opts.intervalMs ?? 1500
  const timeoutMs = opts.timeoutMs ?? 90000
  const started = Date.now()

  while (Date.now() - started < timeoutMs) {
    const res = await $fetch<{ job: {
      status: string
      outputPayload: Record<string, unknown> | null
      lastError: string | null
    } }>(`/api/ai/jobs/${jobId}`)
    const { status, outputPayload, lastError } = res.job
    if (status === 'done') return { status, outputPayload, lastError }
    if (status === 'failed') throw new Error(lastError ?? 'Line audit failed')
    await new Promise(r => setTimeout(r, intervalMs))
  }

  throw new Error('Line audit timed out — try saving again in a moment')
}
