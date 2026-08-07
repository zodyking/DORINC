/** Shared invoice line audit prompts + conservative filtering (used by API and worker). */

import {
  createAiRuleCard,
  formatAiRulesForPrompt,
  parseAiRuleCards,
  serializeAiRuleCards,
} from './ai-rules.mjs'

export const DEFAULT_INVOICE_LINE_AI_RULE_CARDS = [
  createAiRuleCard({
    title: 'Shop language',
    rule: 'Every line description must be shop language, not simplified customer-facing grammar (example: keep "Replace Tire", do not rewrite to "Tire Replacement"). Descriptions must be grammatically correct, title cased, and free of spelling errors.',
  }),
  createAiRuleCard({
    title: 'Quantity column',
    rule: 'Do not repeat quantity in the description when the qty column already holds the count — move counts out of the description into qty.',
  }),
  createAiRuleCard({
    title: 'Count match',
    rule: 'When the description mentions a numeric count (e.g. "2 windows", "four tires"), qty must match unless the line is clearly one bundled lump-sum job.',
  }),
  createAiRuleCard({
    title: 'Unit price from total',
    rule: 'When a line total implies a per-unit rate for a mentioned quantity, set unitPrice = line total ÷ qty (example: $350 for 2 units → qty 2, unitPrice 175).',
  }),
  createAiRuleCard({
    title: 'Math consistency',
    rule: 'quantity × unitPrice must equal the intended line amount; adjust fields together when fixing mismatches.',
  }),
  createAiRuleCard({
    title: 'No invention',
    rule: 'Preserve factual accuracy — do not invent parts, labor hours, or services not implied by the original line.',
  }),
  createAiRuleCard({
    title: 'Line type',
    rule: 'Keep lineType (part / labor / fee) consistent with the work described.',
  }),
  createAiRuleCard({
    title: 'Minimal changes',
    rule: 'Try to keep original wording as much as possible — ignore lines that are already acceptable; only change lines that actually need changing.',
  }),
  createAiRuleCard({
    title: 'Abbreviations',
    rule: 'Ignore abbreviations such as F/R, F/L, R/R, R/L, R/S, L/S, and combinations — they are correct for this platform.',
  }),
  createAiRuleCard({
    title: 'Correction style',
    rule: 'When correcting a line, preserve shop wording where possible; stay professional, concise, and descriptive — never output generic filler lines.',
  }),
]

export const DEFAULT_INVOICE_LINE_AI_RULES = serializeAiRuleCards(DEFAULT_INVOICE_LINE_AI_RULE_CARDS)

export const LINE_AUDIT_SYSTEM_INSTRUCTIONS = [
  'You audit invoice line items before they are saved.',
  'Return JSON only with this shape:',
  '{ "lines": [ { "lineItemId": "uuid", "status": "ok"|"needs_fix", "issues": ["..."],',
  '"suggested": { "description": "...", "quantity": "...", "unitPrice": "..." } | null } ] }',
  'You must return exactly one entry per input line with the matching lineItemId — never skip a line.',
  'Review every line independently. One bad line does not excuse skipping others.',
  'Default to status "ok" with suggested null when a line already satisfies the rules.',
  'Mark "needs_fix" for clear violations: qty/price math mismatch, quantity duplicated in or conflicting with the description, spelling errors, grammar errors, or title-case problems.',
  'Do not rewrite acceptable shop phrasing into customer-facing wording (example: keep "Replace Tire", not "Tire Replacement").',
  'Shop/mechanic phrasing and platform abbreviations (F/R, F/L, R/R, R/L, R/S, L/S, and combinations) are intentional — do not change them when already correct.',
  'When fixing, change only fields required by the violation and preserve original wording everywhere else.',
  'Rules to enforce:',
].join(' ')

export function normalizeInvoiceLineAiRules(rules) {
  return serializeAiRuleCards(
    parseAiRuleCards(rules, DEFAULT_INVOICE_LINE_AI_RULE_CARDS),
  )
}

export function buildLineAuditSystemPrompt(rules) {
  const normalized = normalizeInvoiceLineAiRules(rules)
  return `${LINE_AUDIT_SYSTEM_INSTRUCTIONS}\n${formatAiRulesForPrompt(normalized, DEFAULT_INVOICE_LINE_AI_RULE_CARDS)}`
}

export function buildLineAuditUserPrompt(complaint, inputLines) {
  return [
    complaint ? `Invoice complaint context: ${complaint}` : '',
    'Audit every line item below independently. Return one result object per lineItemId.',
    'Mark "needs_fix" only for clear rule violations (qty/price mismatch, quantity in description conflicts with qty column, spelling/grammar/title-case errors).',
    'Leave acceptable shop descriptions unchanged — do not reword lines that already comply.',
    JSON.stringify({ lines: inputLines }, null, 2),
  ].filter(Boolean).join('\n\n')
}

function parseDecimal(value) {
  const n = Number(String(value ?? '').replace(/,/g, '').trim())
  return Number.isFinite(n) ? n : null
}

function formatDecimal(value) {
  const n = parseDecimal(value)
  if (n == null) return String(value ?? '').trim()
  return n.toFixed(2)
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

function descriptionCountConflictsWithQty(description, qty) {
  const q = parseDecimal(qty)
  if (q == null) return false
  const counts = extractCountsFromDescription(description)
  if (!counts.length) return false
  return counts.some(count => Math.abs(count - q) > 0.0001)
}

function removeCountTokenFromDescription(description, count) {
  let text = String(description ?? '')
  text = text.replace(new RegExp(`\\b${count}\\b`), '')
  for (const [word, value] of Object.entries(WORD_NUMBERS)) {
    if (Math.abs(value - count) < 0.0001) {
      text = text.replace(new RegExp(`\\b${word}\\b`, 'i'), '')
    }
  }
  return text.replace(/\s+/g, ' ').trim()
}

function suggestQtyCountFix(input) {
  const qty = parseDecimal(input.quantity)
  const unitPrice = parseDecimal(input.unitPrice)
  const lineAmount = parseDecimal(input.lineAmount) ?? (
    qty != null && unitPrice != null ? qty * unitPrice : null
  )
  const counts = extractCountsFromDescription(input.description)
  if (!counts.length || lineAmount == null) return null

  const conflictCount = counts.find(count => qty == null || Math.abs(count - qty) > 0.0001)
    ?? (descriptionRepeatsQty(input.description, input.quantity) ? qty : null)
  if (conflictCount == null || conflictCount <= 0) return null

  return {
    description: removeCountTokenFromDescription(input.description, conflictCount),
    quantity: formatDecimal(conflictCount),
    unitPrice: formatDecimal(lineAmount / conflictCount),
  }
}

const DESCRIPTION_SPELLING_FIXES = [
  {
    test: /\bhead\s+lite\b/i,
    apply: desc => desc.replace(/\bhead\s+lite\b/gi, 'Head Light'),
    issue: 'Misspelling: "Head Lite" should be "Head Light"',
  },
  {
    test: /\btail\s+lite\b/i,
    apply: desc => desc.replace(/\btail\s+lite\b/gi, 'Tail Light'),
    issue: 'Misspelling: "Tail Lite" should be "Tail Light"',
  },
  {
    test: /\bbrake\s+lite\b/i,
    apply: desc => desc.replace(/\bbrake\s+lite\b/gi, 'Brake Light'),
    issue: 'Misspelling: "Brake Lite" should be "Brake Light"',
  },
  {
    test: /\bL\.E\.D\b/,
    apply: desc => desc.replace(/\bL\.E\.D\b/g, 'LED'),
    issue: 'Use "LED" instead of "L.E.D"',
  },
]

function detectDescriptionSpellingIssues(description) {
  let next = String(description ?? '')
  const issues = []

  for (const rule of DESCRIPTION_SPELLING_FIXES) {
    if (!rule.test.test(next)) continue
    next = rule.apply(next)
    issues.push(rule.issue)
  }

  if (!issues.length) return null
  return { description: next.replace(/\s+/g, ' ').trim(), issues }
}

/** Deterministic checks that should always flag obvious qty/spelling issues. */
export function detectDeterministicLineIssue(input) {
  const original = {
    description: String(input.description ?? ''),
    quantity: String(input.quantity ?? ''),
    unitPrice: String(input.unitPrice ?? ''),
  }
  const issues = []
  let suggested = { ...original }

  if (descriptionCountConflictsWithQty(input.description, input.quantity)) {
    issues.push('Quantity in the description does not match the qty column')
    const qtyFix = suggestQtyCountFix(input)
    if (qtyFix) suggested = qtyFix
  }
  else if (descriptionRepeatsQty(input.description, input.quantity)) {
    issues.push('Quantity is duplicated in the description')
    suggested = {
      ...original,
      description: removeCountTokenFromDescription(
        input.description,
        parseDecimal(input.quantity) ?? extractCountsFromDescription(input.description)[0],
      ),
    }
  }

  if (!lineAmountMatches(input.quantity, input.unitPrice, input.lineAmount)) {
    issues.push('quantity × unitPrice does not equal the line amount')
    const qty = parseDecimal(input.quantity)
    const amount = parseDecimal(input.lineAmount)
    if (qty != null && qty > 0 && amount != null) {
      suggested = {
        ...suggested,
        quantity: formatDecimal(qty),
        unitPrice: formatDecimal(amount / qty),
      }
    }
  }

  const spelling = detectDescriptionSpellingIssues(suggested.description)
  if (spelling) {
    issues.push(...spelling.issues)
    suggested = { ...suggested, description: spelling.description }
  }

  if (!issues.length) return null

  return {
    status: 'needs_fix',
    issues: [...new Set(issues)],
    suggested,
  }
}

function isCustomerizationRewrite(original, suggested) {
  const o = String(original ?? '').trim()
  const s = String(suggested ?? '').trim()
  if (!o || !s) return false

  const oLower = o.toLowerCase()
  const sLower = s.toLowerCase()
  if (oLower === sLower) return true

  if (/\breplace\b/.test(oLower) && /\breplacement\b/.test(sLower) && !/\breplacement\b/.test(oLower)) {
    const strippedOriginal = oLower.replace(/\breplace\b/g, '').replace(/\s+/g, ' ').trim()
    const strippedSuggested = sLower.replace(/\breplacement\b/g, '').replace(/\s+/g, ' ').trim()
    if (strippedSuggested === strippedOriginal || strippedSuggested.includes(strippedOriginal)) return true
  }

  if (/\brepair\b/.test(oLower) && /\brepair\b/.test(sLower)) {
    const oMatch = oLower.match(/^repair\s+(.+)$/)
    const sMatch = sLower.match(/^(.+)\s+repair$/)
    if (oMatch && sMatch && oMatch[1] === sMatch[1]) return true
  }

  return false
}

/** Downgrade customerization rewrites; keep spelling/qty/price fixes. */
export function applyConservativeAuditFilter(inputLines, auditLines) {
  const inputById = new Map(inputLines.map(line => [line.lineItemId, line]))

  return auditLines.map((line) => {
    if (line.status !== 'needs_fix') return line

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

    const input = inputById.get(line.lineItemId)
    const lineAmount = input?.lineAmount
    const mathWasValid = lineAmountMatches(original.quantity, original.unitPrice, lineAmount)
    const hadQtyDup = descriptionRepeatsQty(original.description, original.quantity)
    const stillHasQtyDup = descriptionRepeatsQty(suggested.description, suggested.quantity)
    const hadQtyConflict = descriptionCountConflictsWithQty(original.description, original.quantity)

    if (!mathWasValid) return line
    if (hadQtyDup && !stillHasQtyDup) return line
    if (hadQtyConflict) return line

    const spelling = detectDescriptionSpellingIssues(original.description)
    if (spelling && String(suggested.description).trim() === spelling.description.trim()) return line

    if (isCustomerizationRewrite(original.description, suggested.description)) {
      return { ...line, status: 'ok', issues: [], suggested: null }
    }

    return line
  })
}

function buildAiAuditRow(input, ai) {
  const original = {
    description: input.description,
    quantity: String(input.quantity),
    unitPrice: String(input.unitPrice),
  }
  const status = ai?.status === 'needs_fix' ? 'needs_fix' : 'ok'
  const issues = Array.isArray(ai?.issues)
    ? ai.issues.map(i => String(i)).filter(Boolean).slice(0, 20)
    : []
  let suggested = null
  if (status === 'needs_fix' && ai?.suggested && typeof ai.suggested === 'object') {
    suggested = {
      description: String(ai.suggested.description ?? original.description).slice(0, 500),
      quantity: String(ai.suggested.quantity ?? original.quantity).slice(0, 30),
      unitPrice: String(ai.suggested.unitPrice ?? original.unitPrice).slice(0, 30),
    }
  }
  return {
    lineItemId: input.lineItemId,
    sortOrder: input.sortOrder,
    lineType: input.lineType === 'part' || input.lineType === 'fee' ? input.lineType : 'labor',
    status,
    issues,
    original,
    suggested,
  }
}

function mergeAuditRows(aiRow, deterministic) {
  if (!deterministic) return aiRow
  if (aiRow.status !== 'needs_fix') return { ...aiRow, ...deterministic }

  return {
    ...aiRow,
    status: 'needs_fix',
    issues: [...new Set([...(aiRow.issues ?? []), ...deterministic.issues])].slice(0, 20),
    suggested: deterministic.suggested ?? aiRow.suggested,
  }
}

/** Normalize AI output, merge deterministic checks, and apply conservative filtering. */
export function normalizeLineAuditResults(inputLines, aiLines) {
  const normalized = inputLines.map((input) => {
    const ai = aiLines.find(row => String(row.lineItemId) === input.lineItemId)
    const aiRow = buildAiAuditRow(input, ai)
    const deterministic = detectDeterministicLineIssue(input)
    return mergeAuditRows(aiRow, deterministic)
  })

  return applyConservativeAuditFilter(inputLines, normalized)
}
