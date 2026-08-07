/** Service log extraction rules + two-step prompts (API + worker). */

import {
  createAiRuleCard,
  formatAiRulesForPrompt,
  parseAiRuleCards,
  serializeAiRuleCards,
} from './ai-rules.mjs'

export const DEFAULT_SERVICE_LOG_EXTRACTION_RULE_CARDS = [
  createAiRuleCard({
    title: 'Handwritten pages',
    rule: 'When the page is fully handwritten, read carefully and prefer mechanic wording; ignore smudges and crossed-out text when a replacement is written nearby.',
  }),
  createAiRuleCard({
    title: 'Printed forms',
    rule: 'When the page is a printed form with handwriting, extract only filled-in handwritten or checked values — ignore blank printed placeholders and unused checkbox options.',
  }),
  createAiRuleCard({
    title: 'Line items',
    rule: 'Capture billable line items with description, quantity, and unit price/rate when visible. Use plain numbers without currency symbols.',
  }),
  createAiRuleCard({
    title: 'Do not invent',
    rule: 'Do not invent parts, labor, quantities, or prices that are not visible on the page. Leave qty/rate/amount null when unclear.',
  }),
  createAiRuleCard({
    title: 'Complaint vs notes',
    rule: 'Put customer symptoms in complaint and mechanic/shop notes in internalNotes when both appear.',
  }),
]

export const DEFAULT_SERVICE_LOG_EXTRACTION_RULES = serializeAiRuleCards(
  DEFAULT_SERVICE_LOG_EXTRACTION_RULE_CARDS,
)

export function normalizeServiceLogExtractionRules(rules) {
  return serializeAiRuleCards(
    parseAiRuleCards(rules, DEFAULT_SERVICE_LOG_EXTRACTION_RULE_CARDS),
  )
}

export function buildPageTypeSystemPrompt() {
  return [
    'You classify a service log photo page for extraction.',
    'Return JSON only:',
    '{ "pageType": "handwritten" | "printed_form", "confidence": 0-1, "notes": "short reason" }',
    'Use "handwritten" when the page is essentially freeform handwriting with little or no printed form structure.',
    'Use "printed_form" when there is a printed template/checkboxes/fields and a person filled them in by hand or mark.',
  ].join(' ')
}

export function buildPageTypeUserPrompt(pageIndex, pageCount) {
  return `Classify page ${pageIndex} of ${pageCount}. Return JSON only.`
}

export function buildExtractionSystemPrompt(rules, pageType) {
  const typeHint = pageType === 'printed_form'
    ? 'This page is a printed form with handwriting — filter out unused printed labels and blank fields; extract filled values only.'
    : 'This page is fully handwritten — prioritize legible billable work and ignore pure doodles/noise.'

  return [
    'You extract structured service log data from one photo page.',
    typeHint,
    'Return JSON only with keys:',
    'complaint (string|null), internalNotes (string|null),',
    'draftLineItems (array of {description, qty, rate, amount} — plain numbers, no currency symbols).',
    'If a field is not visible, use null or omit draftLineItems.',
    'Rules to enforce:',
    formatAiRulesForPrompt(rules, DEFAULT_SERVICE_LOG_EXTRACTION_RULE_CARDS),
  ].join('\n')
}

export function buildExtractionUserPrompt(pageIndex, pageCount, pageType, context = {}) {
  return [
    `Extract billable fields from page ${pageIndex} of ${pageCount}.`,
    `Page type: ${pageType}.`,
    context.complaint ? `Existing complaint (may refine): ${context.complaint}` : '',
    context.internalNotes ? `Existing internal notes (may refine): ${context.internalNotes}` : '',
    'Return JSON only.',
  ].filter(Boolean).join('\n')
}

function joinUniqueText(parts) {
  const seen = new Set()
  const out = []
  for (const part of parts) {
    const text = String(part ?? '').trim()
    if (!text) continue
    const key = text.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    out.push(text)
  }
  return out.length ? out.join('\n') : null
}

/** Merge per-page extraction JSON into one suggestion payload. */
export function mergeServiceLogPageExtractions(pages, primaryFileId) {
  const list = Array.isArray(pages) ? pages : []
  const draftLineItems = []
  for (const page of list) {
    const items = page?.draftLineItems
    if (!Array.isArray(items)) continue
    for (const item of items) {
      if (!item || typeof item !== 'object') continue
      const description = String(item.description ?? '').trim()
      if (!description) continue
      draftLineItems.push({
        description,
        qty: item.qty == null || item.qty === '' ? null : String(item.qty),
        rate: item.rate == null || item.rate === '' ? null : String(item.rate),
        amount: item.amount == null || item.amount === '' ? null : String(item.amount),
      })
    }
  }

  return {
    complaint: joinUniqueText(list.map(p => p?.complaint)),
    internalNotes: joinUniqueText(list.map(p => p?.internalNotes)),
    draftLineItems: draftLineItems.length ? draftLineItems : undefined,
    fileId: primaryFileId || list[0]?.fileId || undefined,
    pageResults: list.map((page, index) => ({
      pageIndex: index + 1,
      fileId: page?.fileId ?? null,
      pageType: page?.pageType ?? null,
      confidence: page?.confidence ?? null,
    })),
  }
}

export function normalizePageType(raw) {
  const value = String(raw ?? '').trim().toLowerCase()
  if (value === 'printed_form' || value === 'printed' || value === 'form') return 'printed_form'
  return 'handwritten'
}

export {
  createAiRuleCard,
  formatAiRulesForPrompt,
  parseAiRuleCards,
  serializeAiRuleCards,
}
