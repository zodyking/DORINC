import { describe, expect, it } from 'vitest'
import {
  applyConservativeAuditFilter,
  buildLineAuditSystemPrompt,
  buildLineAuditUserPrompt,
  DEFAULT_INVOICE_LINE_AI_RULES,
  detectDeterministicLineIssue,
  normalizeLineAuditResults,
} from '../../shared/invoice-line-audit.mjs'
import { normalizeInvoiceLineAiRules } from '../../shared/invoice-line-ai-rules'

describe('invoice line AI rules', () => {
  it('returns defaults when rules are empty', () => {
    expect(normalizeInvoiceLineAiRules('')).toBe(DEFAULT_INVOICE_LINE_AI_RULES)
    expect(normalizeInvoiceLineAiRules('   ')).toBe(DEFAULT_INVOICE_LINE_AI_RULES)
  })

  it('normalizes custom newline rules into JSON cards', () => {
    const normalized = normalizeInvoiceLineAiRules('Custom rule')
    const parsed = JSON.parse(normalized)
    expect(parsed).toHaveLength(1)
    expect(parsed[0].rule).toBe('Custom rule')
  })

  it('uses conservative audit instructions in the system prompt', () => {
    const prompt = buildLineAuditSystemPrompt('Custom rule')
    expect(prompt).toContain('Review every line independently')
    expect(prompt).toContain('never skip a line')
    expect(prompt).not.toContain('customer-facing invoice')
    expect(prompt).toContain('Custom rule')
  })

  it('asks the model to audit every line in the user prompt', () => {
    const prompt = buildLineAuditUserPrompt(null, [{ lineItemId: 'x', description: 'Replace Tire' }])
    expect(prompt).toContain('Audit every line item below independently')
    expect(prompt).not.toContain('Apply the rules strictly')
  })
})

describe('detectDeterministicLineIssue', () => {
  it('flags qty conflicts when description count differs from qty column', () => {
    const issue = detectDeterministicLineIssue({
      description: 'Replace 2 Tire',
      quantity: '1',
      unitPrice: '650.00',
      lineAmount: '650.00',
    })

    expect(issue?.status).toBe('needs_fix')
    expect(issue?.suggested?.quantity).toBe('2.00')
    expect(issue?.suggested?.unitPrice).toBe('325.00')
    expect(issue?.suggested?.description).toBe('Replace Tire')
  })

  it('flags common headlight spelling issues without changing qty', () => {
    const issue = detectDeterministicLineIssue({
      description: 'Replace R/S Head Lite L.E.D',
      quantity: '1',
      unitPrice: '275.00',
      lineAmount: '275.00',
    })

    expect(issue?.status).toBe('needs_fix')
    expect(issue?.suggested?.description).toBe('Replace R/S Head Light LED')
    expect(issue?.suggested?.quantity).toBe('1')
    expect(issue?.suggested?.unitPrice).toBe('275.00')
  })

  it('returns null for acceptable shop lines', () => {
    expect(detectDeterministicLineIssue({
      description: 'Repair Bumper',
      quantity: '1',
      unitPrice: '300.00',
      lineAmount: '300.00',
    })).toBeNull()
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

  it('keeps spelling fixes when qty and price are unchanged', () => {
    const inputLines = [{
      lineItemId,
      description: 'Replace R/S Head Lite L.E.D',
      quantity: '1',
      unitPrice: '275.00',
      lineAmount: '275.00',
    }]
    const auditLines = [{
      lineItemId,
      status: 'needs_fix',
      issues: ['Misspelling'],
      original: { description: 'Replace R/S Head Lite L.E.D', quantity: '1', unitPrice: '275.00' },
      suggested: { description: 'Replace R/S Head Light LED', quantity: '1', unitPrice: '275.00' },
    }]

    const filtered = applyConservativeAuditFilter(inputLines, auditLines)
    expect(filtered[0]?.status).toBe('needs_fix')
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
})

describe('normalizeLineAuditResults', () => {
  it('flags multiple lines even when AI only returns one issue', () => {
    const line1 = '11111111-1111-1111-1111-111111111111'
    const line3 = '33333333-3333-3333-3333-333333333333'
    const inputLines = [
      {
        lineItemId: line1,
        lineType: 'part',
        description: 'Replace 2 Tire',
        quantity: '1',
        unitPrice: '650.00',
        lineAmount: '650.00',
      },
      {
        lineItemId: '22222222-2222-2222-2222-222222222222',
        lineType: 'labor',
        description: 'Repair Bumper',
        quantity: '1',
        unitPrice: '300.00',
        lineAmount: '300.00',
      },
      {
        lineItemId: line3,
        lineType: 'part',
        description: 'Replace R/S Head Lite L.E.D',
        quantity: '1',
        unitPrice: '275.00',
        lineAmount: '275.00',
      },
    ]

    const results = normalizeLineAuditResults(inputLines, [{
      lineItemId: line1,
      status: 'needs_fix',
      issues: ['Qty mismatch'],
      suggested: {
        description: 'Replace Tire',
        quantity: '2',
        unitPrice: '325.00',
      },
    }])

    expect(results.filter(line => line.status === 'needs_fix')).toHaveLength(2)
    expect(results.find(line => line.lineItemId === line3)?.suggested?.description)
      .toBe('Replace R/S Head Light LED')
  })
})
