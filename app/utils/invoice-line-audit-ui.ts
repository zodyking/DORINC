import type { AiSuggestionRow } from './ai-ui'
import type { InvoiceLineAuditContent } from '../../shared/validators/ai'

/** Client-only suggestion id when audit passed with zero issues (no server suggestion row). */
export const LOCAL_LINE_AUDIT_PASS_ID = 'local-line-audit-pass'

export function isLineAuditSuggestion(suggestion: AiSuggestionRow): boolean {
  return (suggestion.suggestedContent as { kind?: string }).kind === 'invoice_line_audit'
}

/** Build a pending suggestion so the review modal can open after a clean audit. */
export function buildLineAuditPassSuggestion(
  auditContent: InvoiceLineAuditContent,
): AiSuggestionRow {
  return {
    id: LOCAL_LINE_AUDIT_PASS_ID,
    aiJobId: '',
    featureType: 'invoice_description',
    status: 'pending',
    originalContent: null,
    suggestedContent: auditContent as unknown as Record<string, unknown>,
    reviewedAt: null,
    createdAt: new Date().toISOString(),
  }
}

export function isLocalLineAuditPass(suggestion: AiSuggestionRow | null | undefined): boolean {
  return suggestion?.id === LOCAL_LINE_AUDIT_PASS_ID
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

/** True until the invoice has completed or reviewed a line audit at least once. */
export function invoiceNeedsInitialLineAudit(opts: {
  historyActions: string[]
}): boolean {
  return !opts.historyActions.some(action => LINE_AUDIT_REVIEW_ACTIONS.has(action))
}

/**
 * @deprecated Prefer invoiceNeedsInitialLineAudit — kept for older call sites/tests.
 * Service-log drafts that have never been audited still need first review.
 */
export function invoiceNeedsInitialServiceLogReview(opts: {
  creationSource?: string | null
  status: string
  historyActions: string[]
  locallyCleared?: boolean
}): boolean {
  if (opts.locallyCleared) return false
  if (opts.creationSource !== 'service_log') return false
  if (opts.status !== 'draft') return false
  return invoiceNeedsInitialLineAudit(opts)
}

/**
 * Run invoice description / line audit on save when:
 * - the editor has any change (even one character), or
 * - this invoice has never completed a line audit yet (first save / first review).
 */
export function shouldRunLineAuditBeforeSave(opts: {
  isDirty: boolean
  historyActions: string[]
  /** @deprecated Ignored — first audit applies to all creation sources. */
  creationSource?: string | null
  /** @deprecated Ignored — first audit is history-based. */
  status?: string
  locallyCleared?: boolean
}): boolean {
  if (opts.locallyCleared) return false
  if (opts.isDirty) return true
  return invoiceNeedsInitialLineAudit(opts)
}

/** Soft-skip only when AI genuinely cannot run; do not swallow real audit failures. */
export function shouldSkipLineAuditError(e: unknown): boolean {
  const err = e as { data?: { message?: string, code?: string }, statusCode?: number }
  const message = (err.data?.message ?? '').toLowerCase()
  const code = err.data?.code

  if (code === 'CONFLICT' || err.statusCode === 409) {
    return message.includes('not configured')
      || message.includes('this ai feature is disabled')
      || message.includes('spend cap')
      || message.includes('api key')
      || message.includes('authentication')
  }

  return message.includes('not configured')
    || message.includes('this ai feature is disabled')
    || message.includes('spend cap')
    || message.includes('api key')
    || message.includes('authentication')
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
