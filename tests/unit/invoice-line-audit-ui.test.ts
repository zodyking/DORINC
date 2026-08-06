import { describe, expect, it } from 'vitest'
import type { AiSuggestionRow } from '../../app/utils/ai-ui'
import {
  buildLineAuditPassSuggestion,
  invoiceNeedsInitialLineAudit,
  invoiceNeedsInitialServiceLogReview,
  isLineAuditSuggestion,
  isLocalLineAuditPass,
  latestLineAuditSuggestion,
  lineAuditHasIssues,
  lineAuditIssueLines,
  parseLineAuditContent,
  shouldRunLineAuditBeforeSave,
  shouldSkipLineAuditError,
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

  it('needs initial line audit until completed or reviewed', () => {
    expect(invoiceNeedsInitialLineAudit({
      historyActions: ['invoices.create'],
    })).toBe(true)

    expect(invoiceNeedsInitialLineAudit({
      historyActions: ['invoices.create', 'ai.line_audit.completed'],
    })).toBe(false)

    expect(invoiceNeedsInitialLineAudit({
      historyActions: ['invoices.create', 'ai.line_audit.reviewed'],
    })).toBe(false)
  })

  it('requires initial review for unreviewed service-log drafts', () => {
    expect(invoiceNeedsInitialServiceLogReview({
      creationSource: 'service_log',
      status: 'draft',
      historyActions: ['invoices.create'],
    })).toBe(true)

    expect(invoiceNeedsInitialServiceLogReview({
      creationSource: 'service_log',
      status: 'draft',
      historyActions: ['invoices.create', 'ai.line_audit.completed'],
    })).toBe(false)

    expect(invoiceNeedsInitialServiceLogReview({
      creationSource: 'blank',
      status: 'draft',
      historyActions: [],
    })).toBe(false)
  })

  it('runs line audit when dirty or never audited yet', () => {
    expect(shouldRunLineAuditBeforeSave({
      isDirty: true,
      creationSource: 'blank',
      status: 'draft',
      historyActions: ['invoices.create', 'ai.line_audit.completed'],
    })).toBe(true)

    expect(shouldRunLineAuditBeforeSave({
      isDirty: false,
      creationSource: 'blank',
      status: 'draft',
      historyActions: ['invoices.create'],
    })).toBe(true)

    expect(shouldRunLineAuditBeforeSave({
      isDirty: false,
      creationSource: 'blank',
      status: 'draft',
      historyActions: ['invoices.create', 'ai.line_audit.completed'],
    })).toBe(false)

    expect(shouldRunLineAuditBeforeSave({
      isDirty: false,
      creationSource: 'service_log',
      status: 'draft',
      historyActions: ['invoices.create'],
    })).toBe(true)
  })

  it('builds a local pass suggestion so the review modal can open with zero issues', () => {
    const pass = buildLineAuditPassSuggestion({
      kind: 'invoice_line_audit',
      checkedAt: '2026-08-06T12:00:00.000Z',
      summary: { totalLines: 1, issuesFound: 0 },
      lines: [{
        lineItemId: 'line-1',
        sortOrder: 0,
        lineType: 'labor',
        status: 'ok',
        issues: [],
        original: { description: 'Oil change', quantity: '1', unitPrice: '85.00' },
        suggested: null,
      }],
    })
    expect(isLocalLineAuditPass(pass)).toBe(true)
    expect(isLineAuditSuggestion(pass)).toBe(true)
    expect(lineAuditHasIssues(parseLineAuditContent(pass)!)).toBe(false)
  })

  it('soft-skips only configuration / feature-disabled errors', () => {
    expect(shouldSkipLineAuditError({
      statusCode: 409,
      data: { message: 'AI is not configured', code: 'CONFLICT' },
    })).toBe(true)

    expect(shouldSkipLineAuditError({
      statusCode: 409,
      data: { message: 'This AI feature is disabled', code: 'CONFLICT' },
    })).toBe(true)

    expect(shouldSkipLineAuditError({
      statusCode: 409,
      data: { message: 'Edit session conflict', code: 'CONFLICT' },
    })).toBe(false)

    expect(shouldSkipLineAuditError({
      statusCode: 500,
      data: { message: 'OpenRouter blew up' },
    })).toBe(false)
  })
})
