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
