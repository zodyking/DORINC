import { describe, expect, it } from 'vitest'
import {
  applyConservativeAuditFilter,
  buildLineAuditSystemPrompt,
  buildLineAuditUserPrompt,
  DEFAULT_INVOICE_LINE_AI_RULES,
} from '../../shared/invoice-line-audit.mjs'
import { normalizeInvoiceLineAiRules } from '../../shared/invoice-line-ai-rules'

describe('invoice line AI rules', () => {
  it('returns defaults when rules are empty', () => {
    expect(normalizeInvoiceLineAiRules('')).toBe(DEFAULT_INVOICE_LINE_AI_RULES)
    expect(normalizeInvoiceLineAiRules('   ')).toBe(DEFAULT_INVOICE_LINE_AI_RULES)
  })

  it('keeps custom rules when provided', () => {
    expect(normalizeInvoiceLineAiRules('Custom rule')).toBe('Custom rule')
  })

  it('uses conservative audit instructions in the system prompt', () => {
    const prompt = buildLineAuditSystemPrompt('Custom rule')
    expect(prompt).toContain('Be conservative')
    expect(prompt).toContain('shop language')
    expect(prompt).not.toContain('customer-facing invoice')
    expect(prompt).toContain('Custom rule')
  })

  it('asks the model to default lines to ok in the user prompt', () => {
    const prompt = buildLineAuditUserPrompt(null, [{ lineItemId: 'x', description: 'Replace Tire' }])
    expect(prompt).toContain('Default to status "ok"')
    expect(prompt).not.toContain('Apply the rules strictly')
  })
})

describe('applyConservativeAuditFilter', () => {
  const lineItemId = '11111111-1111-1111-1111-111111111111'

  it('downgrades cosmetic description-only rewrites when qty and price are unchanged', () => {
    const inputLines = [{
      lineItemId,
      description: 'Replace Tire F/R',
      quantity: '1',
      unitPrice: '125.00',
      lineAmount: '125.00',
    }]
    const auditLines = [{
      lineItemId,
      status: 'needs_fix',
      issues: ['Use customer-facing wording'],
      original: { description: 'Replace Tire F/R', quantity: '1', unitPrice: '125.00' },
      suggested: { description: 'Tire Replacement F/R', quantity: '1', unitPrice: '125.00' },
    }]

    const filtered = applyConservativeAuditFilter(inputLines, auditLines)
    expect(filtered[0]?.status).toBe('ok')
    expect(filtered[0]?.suggested).toBeNull()
  })

  it('keeps fixes when quantity or unit price must change', () => {
    const inputLines = [{
      lineItemId,
      description: '2 tires F/R',
      quantity: '1',
      unitPrice: '350.00',
      lineAmount: '350.00',
    }]
    const auditLines = [{
      lineItemId,
      status: 'needs_fix',
      issues: ['Qty mismatch'],
      original: { description: '2 tires F/R', quantity: '1', unitPrice: '350.00' },
      suggested: { description: 'Tires F/R', quantity: '2', unitPrice: '175.00' },
    }]

    const filtered = applyConservativeAuditFilter(inputLines, auditLines)
    expect(filtered[0]?.status).toBe('needs_fix')
  })

  it('keeps fixes that remove duplicated quantity from the description', () => {
    const inputLines = [{
      lineItemId,
      description: '2 Window Regulator F/L',
      quantity: '2',
      unitPrice: '90.00',
      lineAmount: '180.00',
    }]
    const auditLines = [{
      lineItemId,
      status: 'needs_fix',
      issues: ['Quantity duplicated in description'],
      original: { description: '2 Window Regulator F/L', quantity: '2', unitPrice: '90.00' },
      suggested: { description: 'Window Regulator F/L', quantity: '2', unitPrice: '90.00' },
    }]

    const filtered = applyConservativeAuditFilter(inputLines, auditLines)
    expect(filtered[0]?.status).toBe('needs_fix')
  })
})
