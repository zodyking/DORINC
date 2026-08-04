import { describe, expect, it } from 'vitest'
import type { AiSuggestionRow } from '../../app/utils/ai-ui'
import {
  isLineAuditSuggestion,
  latestLineAuditSuggestion,
  lineAuditHasIssues,
  lineAuditIssueLines,
  parseLineAuditContent,
} from '../../app/utils/invoice-line-audit-ui'

const auditSuggestion: AiSuggestionRow = {
  id: 's1',
  aiJobId: 'j1',
  featureType: 'invoice_description',
  status: 'pending',
  originalContent: null,
  suggestedContent: {
    kind: 'invoice_line_audit',
    checkedAt: '2026-08-04T12:00:00.000Z',
    summary: { totalLines: 2, issuesFound: 1 },
    lines: [
      {
        lineItemId: 'line-1',
        sortOrder: 0,
        lineType: 'labor',
        status: 'ok',
        issues: [],
        original: { description: 'Oil change', quantity: '1', unitPrice: '85.00' },
        suggested: null,
      },
      {
        lineItemId: 'line-2',
        sortOrder: 1,
        lineType: 'part',
        status: 'needs_fix',
        issues: ['Quantity mentioned in description'],
        original: { description: 'Replace 2 windows', quantity: '1', unitPrice: '350.00' },
        suggested: { description: 'Replace windows', quantity: '2', unitPrice: '175.00' },
      },
    ],
  },
  reviewedAt: null,
  createdAt: '2026-08-04T12:00:00.000Z',
}

describe('invoice line audit ui', () => {
  it('detects line audit suggestions', () => {
    expect(isLineAuditSuggestion(auditSuggestion)).toBe(true)
    expect(latestLineAuditSuggestion([auditSuggestion])).toBe(auditSuggestion)
  })

  it('parses audit content and issue lines', () => {
    const content = parseLineAuditContent(auditSuggestion)
    expect(content).not.toBeNull()
    expect(lineAuditHasIssues(content!)).toBe(true)
    expect(lineAuditIssueLines(content!)).toHaveLength(1)
    expect(lineAuditIssueLines(content!)[0]?.suggested?.quantity).toBe('2')
  })
})
