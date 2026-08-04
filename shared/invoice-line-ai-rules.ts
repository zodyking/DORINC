/** Default rules for invoice line-item AI audit (editable in Invoice settings). */

export const DEFAULT_INVOICE_LINE_AI_RULES = [
  'Every line description must be customer-facing, grammatically correct, and free of spelling errors.',
  'Do not repeat quantity in the description when the qty column already holds the count — move counts out of the description into qty.',
  'When the description mentions a numeric count (e.g. "2 windows", "four tires"), qty must match unless the line is clearly one bundled lump-sum job.',
  'When a line total implies a per-unit rate for a mentioned quantity, set unitPrice = line total ÷ qty (example: $350 for 2 units → qty 2, unitPrice 175).',
  'quantity × unitPrice must equal the intended line amount; adjust fields together when fixing mismatches.',
  'Preserve factual accuracy — do not invent parts, labor hours, or services not implied by the original line.',
  'Keep lineType (part / labor / fee) consistent with the work described.',
  'Prefer concise, professional wording suitable for a customer invoice PDF.',
].join('\n')

export function normalizeInvoiceLineAiRules(rules: string | null | undefined): string {
  const trimmed = rules?.trim()
  return trimmed && trimmed.length > 0 ? trimmed : DEFAULT_INVOICE_LINE_AI_RULES
}
