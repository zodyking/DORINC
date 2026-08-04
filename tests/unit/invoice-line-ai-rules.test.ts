import { describe, expect, it } from 'vitest'
import { DEFAULT_INVOICE_LINE_AI_RULES, normalizeInvoiceLineAiRules } from '../../shared/invoice-line-ai-rules'

describe('invoice line AI rules', () => {
  it('returns defaults when rules are empty', () => {
    expect(normalizeInvoiceLineAiRules('')).toBe(DEFAULT_INVOICE_LINE_AI_RULES)
    expect(normalizeInvoiceLineAiRules('   ')).toBe(DEFAULT_INVOICE_LINE_AI_RULES)
  })

  it('keeps custom rules when provided', () => {
    expect(normalizeInvoiceLineAiRules('Custom rule')).toBe('Custom rule')
  })
})
