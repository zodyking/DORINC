/** Shared invoice line audit prompts + conservative filtering (used by API and worker). */

export const DEFAULT_INVOICE_LINE_AI_RULES = [
  'Every line description must be shop language, not simplified customer-facing grammar (example: keep "Replace Tire", do not rewrite to "Tire Replacement"). Descriptions must be grammatically correct, title cased, and free of spelling errors.',
  'Do not repeat quantity in the description when the qty column already holds the count — move counts out of the description into qty.',
  'When the description mentions a numeric count (e.g. "2 windows", "four tires"), qty must match unless the line is clearly one bundled lump-sum job.',
  'When a line total implies a per-unit rate for a mentioned quantity, set unitPrice = line total ÷ qty (example: $350 for 2 units → qty 2, unitPrice 175).',
  'quantity × unitPrice must equal the intended line amount; adjust fields together when fixing mismatches.',
  'Preserve factual accuracy — do not invent parts, labor hours, or services not implied by the original line.',
  'Keep lineType (part / labor / fee) consistent with the work described.',
  'Try to keep original wording as much as possible — ignore lines that are already acceptable; only change lines that actually need changing.',
  'Ignore abbreviations such as F/R, F/L, R/R, R/L, R/S, L/S, and combinations — they are correct for this platform.',
  'When correcting a line, preserve shop wording where possible; stay professional, concise, and descriptive — never output generic filler lines.',
].join('\n')

export const LINE_AUDIT_SYSTEM_INSTRUCTIONS = [
  'You audit invoice line items before they are saved.',
  'Return JSON only with this shape:',
  '{ "lines": [ { "lineItemId": "uuid", "status": "ok"|"needs_fix", "issues": ["..."],',
  '"suggested": { "description": "...", "quantity": "...", "unitPrice": "..." } | null } ] }',
  'For each line provided, return exactly one entry with the same lineItemId.',
  'Be conservative: most lines should be status "ok" with suggested null and an empty issues array.',
  'Use status "needs_fix" only when a rule below is clearly violated — not for style preference, polish, or rephrasing acceptable shop language into customer-facing wording.',
  'Shop/mechanic phrasing is intentional. Do not rewrite acceptable abbreviations (F/R, F/L, R/R, R/L, R/S, L/S, and combinations).',
  'Do not "customerize" or simplify descriptions that already meet the rules.',
  'When fixing, change only fields required by the violation and keep original wording everywhere else.',
  'Rules to enforce:',
].join(' ')

export function normalizeInvoiceLineAiRules(rules) {
  const trimmed = rules?.trim()
  return trimmed && trimmed.length > 0 ? trimmed : DEFAULT_INVOICE_LINE_AI_RULES
}

export function buildLineAuditSystemPrompt(rules) {
  return `${LINE_AUDIT_SYSTEM_INSTRUCTIONS}\n${normalizeInvoiceLineAiRules(rules)}`
}

export function buildLineAuditUserPrompt(complaint, inputLines) {
  return [
    complaint ? `Invoice complaint context: ${complaint}` : '',
    'Audit each line item below. Default to status "ok" when the line already satisfies the rules.',
    'Only mark "needs_fix" for a clear rule violation (qty/price mismatch, quantity duplicated in description, spelling/grammar error, etc.).',
    'Do not suggest changes merely to reword acceptable shop descriptions.',
    JSON.stringify({ lines: inputLines }, null, 2),
  ].filter(Boolean).join('\n\n')
}

function parseDecimal(value) {
  const n = Number(String(value ?? '').replace(/,/g, '').trim())
  return Number.isFinite(n) ? n : null
}

function decimalsEqual(a, b) {
  const na = parseDecimal(a)
  const nb = parseDecimal(b)
  if (na != null && nb != null) return Math.abs(na - nb) < 0.0001
  return String(a ?? '').trim() === String(b ?? '').trim()
}

function lineAmountMatches(qty, unitPrice, lineAmount) {
  const q = parseDecimal(qty)
  const p = parseDecimal(unitPrice)
  if (q == null || p == null) return true
  const expected = q * p
  if (lineAmount == null || lineAmount === '') return true
  const amount = parseDecimal(lineAmount)
  if (amount == null) return true
  return Math.abs(expected - amount) < 0.015
}

const WORD_NUMBERS = {
  one: 1,
  two: 2,
  three: 3,
  four: 4,
  five: 5,
  six: 6,
  seven: 7,
  eight: 8,
  nine: 9,
  ten: 10,
}

function extractCountsFromDescription(description) {
  const text = String(description ?? '')
  const counts = []
  for (const match of text.matchAll(/\b(\d+(?:\.\d+)?)\b/g)) {
    counts.push(Number(match[1]))
  }
  for (const [word, value] of Object.entries(WORD_NUMBERS)) {
    if (new RegExp(`\\b${word}\\b`, 'i').test(text)) counts.push(value)
  }
  return counts
}

function descriptionRepeatsQty(description, qty) {
  const q = parseDecimal(qty)
  if (q == null) return false
  return extractCountsFromDescription(description).some(count => Math.abs(count - q) < 0.0001)
}

/** Downgrade cosmetic-only AI flags so acceptable shop lines stay untouched. */
export function applyConservativeAuditFilter(inputLines, auditLines) {
  const inputById = new Map(inputLines.map(line => [line.lineItemId, line]))

  return auditLines.map((line) => {
    if (line.status !== 'needs_fix') return line

    const input = inputById.get(line.lineItemId)
    const original = line.original
    const suggested = line.suggested
    if (!original || !suggested) return line

    const unchanged = String(original.description).trim() === String(suggested.description).trim()
      && decimalsEqual(original.quantity, suggested.quantity)
      && decimalsEqual(original.unitPrice, suggested.unitPrice)
    if (unchanged) {
      return { ...line, status: 'ok', issues: [], suggested: null }
    }

    const qtySame = decimalsEqual(original.quantity, suggested.quantity)
    const priceSame = decimalsEqual(original.unitPrice, suggested.unitPrice)
    if (!qtySame || !priceSame) return line

    const lineAmount = input?.lineAmount
    const mathWasValid = lineAmountMatches(original.quantity, original.unitPrice, lineAmount)
    const hadQtyDup = descriptionRepeatsQty(original.description, original.quantity)
    const stillHasQtyDup = descriptionRepeatsQty(suggested.description, suggested.quantity)

    if (!mathWasValid) return line
    if (hadQtyDup && !stillHasQtyDup) return line

    if (mathWasValid && qtySame && priceSame) {
      return { ...line, status: 'ok', issues: [], suggested: null }
    }

    return line
  })
}
