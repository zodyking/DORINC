/** Service log extraction rules + two-step prompts (API + worker). */

import {
  createAiRuleCard,
  formatAiRulesForPrompt,
  parseAiRuleCards,
  serializeAiRuleCards,
} from './ai-rules.mjs'

/** Per-line confidence required for rear page / non-template (handwritten) lines. */
export const SERVICE_LOG_HIGH_CERTAINTY_THRESHOLD = 0.85

/** Minimum confidence to keep a front-page checklist match after fuzzy resolve. */
export const SERVICE_LOG_SHEET_MATCH_THRESHOLD = 0.72

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

/**
 * Flatten the active service-log sheet editor catalog into prompt/match items.
 * @param {object|null|undefined} document — ServiceLogSheetDocument v2
 */
export function flattenActiveSheetItems(document) {
  const sections = Array.isArray(document?.sections) ? document.sections : []
  const items = []
  for (const section of sections) {
    const sectionTitle = String(section?.title ?? '').trim()
    const list = Array.isArray(section?.items) ? section.items : []
    for (const item of list) {
      if (!item || typeof item !== 'object') continue
      const id = String(item.id ?? '').trim()
      const name = String(item.name ?? '').trim()
      if (!id || !name) continue
      items.push({
        id,
        name,
        subtext: String(item.subtext ?? '').trim(),
        price: String(item.price ?? '').trim(),
        sectionTitle,
      })
    }
  }
  return items
}

export function formatActiveSheetCatalogForPrompt(items) {
  const list = Array.isArray(items) ? items : []
  if (!list.length) return ''
  return list.map((item) => {
    const price = item.price ? ` | price=${item.price}` : ''
    const sub = item.subtext ? ` | note=${item.subtext}` : ''
    const section = item.sectionTitle ? `[${item.sectionTitle}] ` : ''
    return `- id=${item.id} | ${section}${item.name}${sub}${price}`
  }).join('\n')
}

/** Strip $ / commas from sheet price labels into a plain money string when possible. */
export function sheetPriceToRate(price) {
  const raw = String(price ?? '').trim()
  if (!raw) return null
  const cleaned = raw.replace(/[$,\s]/g, '')
  if (!cleaned || !/^-?\d+(\.\d+)?$/.test(cleaned)) return null
  return cleaned
}

function normalizeMatchText(value) {
  return String(value ?? '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .replace(/\s+/g, ' ')
}

function tokenSet(text) {
  return new Set(normalizeMatchText(text).split(' ').filter(Boolean))
}

/** Dice coefficient on whitespace tokens — good enough for checklist close-match. */
export function sheetItemNameSimilarity(a, b) {
  const left = tokenSet(a)
  const right = tokenSet(b)
  if (!left.size || !right.size) return 0
  let overlap = 0
  for (const token of left) {
    if (right.has(token)) overlap += 1
  }
  return (2 * overlap) / (left.size + right.size)
}

/**
 * Resolve an extracted line to the closest active sheet item.
 * Prefers explicit matchedSheetItemId when it exists in the catalog.
 */
export function matchDraftLineToSheetItem(item, activeItems) {
  const catalog = Array.isArray(activeItems) ? activeItems : []
  if (!catalog.length || !item || typeof item !== 'object') return null

  const byId = String(item.matchedSheetItemId ?? '').trim()
  if (byId) {
    const exact = catalog.find(row => row.id === byId)
    if (exact) return { item: exact, score: 1, via: 'id' }
  }

  const description = String(item.description ?? '').trim()
  if (!description) return null

  let best = null
  let bestScore = 0
  for (const row of catalog) {
    const score = Math.max(
      sheetItemNameSimilarity(description, row.name),
      sheetItemNameSimilarity(description, `${row.name} ${row.subtext}`),
    )
    if (score > bestScore) {
      bestScore = score
      best = row
    }
  }
  if (!best || bestScore < SERVICE_LOG_SHEET_MATCH_THRESHOLD) return null
  return { item: best, score: bestScore, via: 'name' }
}

function clamp01(value) {
  const n = Number(value)
  if (!Number.isFinite(n)) return null
  if (n < 0) return 0
  if (n > 1) return 1
  return n
}

function normalizeCheckMark(raw) {
  if (!raw || typeof raw !== 'object') return null
  const x = clamp01(raw.x ?? raw.left)
  const y = clamp01(raw.y ?? raw.top)
  if (x == null || y == null) return null
  return { x, y }
}

function lineConfidence(item) {
  const n = Number(item?.confidence)
  return Number.isFinite(n) ? Math.min(1, Math.max(0, n)) : null
}

/**
 * Whether this page should lock checklist matching to the active sheet catalog.
 * Based on the AI page-type step: any printed/template page (not handwritten).
 */
export function isSheetLockedPage(pageType) {
  return normalizePageType(pageType) === 'printed_form'
}

/**
 * Handwritten / non-template pages require high per-line certainty.
 */
export function requiresHighCertaintyLines(pageType) {
  return !isSheetLockedPage(pageType)
}

export function buildExtractionSystemPrompt(rules, pageType, options = {}) {
  const type = normalizePageType(pageType)
  const sheetLocked = Boolean(options.sheetLocked)
  const highCertainty = Boolean(options.highCertainty)
  const catalog = formatActiveSheetCatalogForPrompt(options.activeSheetItems)

  const typeHint = type === 'printed_form'
    ? 'This page is a printed form with handwriting — filter out unused printed labels and blank fields; extract filled values only.'
    : 'This page is fully handwritten — prioritize legible billable work and ignore pure doodles/noise.'

  const lines = [
    'You extract structured service log data from one photo page.',
    typeHint,
    'Return JSON only with keys:',
    'complaint (string|null), internalNotes (string|null),',
    'draftLineItems (array of {',
    '  description, qty, rate, amount,',
    '  confidence (0-1 required per line),',
    '  matchedSheetItemId (string|null — sheet catalog id when matched),',
    '  checkMark ({x,y} normalized 0-1 image coords of the checkbox/mark, or null)',
    '} — plain numbers for qty/rate/amount, no currency symbols).',
    'If a field is not visible, use null or omit draftLineItems.',
  ]

  if (sheetLocked && catalog) {
    lines.push(
      'PRINTED TEMPLATE CHECKLIST MODE (locked to active sheet editor list):',
      '- Only extract items that are clearly CHECKED/marked on the form.',
      '- Match each checked item to ONE id from the ACTIVE SHEET LIST below.',
      '- Set description to the exact sheet item name; use the sheet price as rate when no handwritten override is visible.',
      '- Set matchedSheetItemId to that id. Do not invent items outside the list.',
      '- Include checkMark {x,y} for each checked box (image-relative, 0=left/top, 1=right/bottom).',
      '- If you are not sure an item is checked or which list id it is, omit that line.',
      'ACTIVE SHEET LIST:',
      catalog,
    )
  }

  if (highCertainty) {
    lines.push(
      'HIGH-CERTAINTY MODE (handwritten / non-template page):',
      `- Only include a draft line when you are highly certain it is real billable writing (confidence >= ${SERVICE_LOG_HIGH_CERTAINTY_THRESHOLD}).`,
      '- If text is ambiguous, smudged, crossed out, or guessed, SKIP that line entirely.',
      '- Do not invent prices; leave rate/amount null when not clearly written.',
      '- matchedSheetItemId should usually be null on freeform pages unless an item clearly matches the list.',
    )
    if (catalog && !sheetLocked) {
      lines.push('Optional reference sheet list (do not force-fit):', catalog)
    }
  }

  lines.push(
    'Rules to enforce:',
    formatAiRulesForPrompt(rules, DEFAULT_SERVICE_LOG_EXTRACTION_RULE_CARDS),
  )

  return lines.join('\n')
}

export function buildExtractionUserPrompt(pageIndex, pageCount, pageType, context = {}) {
  const sheetLocked = isSheetLockedPage(pageType) && Boolean(context.activeSheetItems?.length)
  const highCertainty = requiresHighCertaintyLines(pageType)

  return [
    `Extract billable fields from page ${pageIndex} of ${pageCount}.`,
    `Page type: ${normalizePageType(pageType)}.`,
    sheetLocked ? 'Mode: printed template checklist locked to active sheet list — checked items only.' : '',
    highCertainty ? `Mode: high-certainty only — skip any line below confidence ${SERVICE_LOG_HIGH_CERTAINTY_THRESHOLD}.` : '',
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

function normalizeDraftLine(raw, meta, activeItems) {
  if (!raw || typeof raw !== 'object') return null
  const pageType = normalizePageType(meta.pageType)
  const pageIndex = Number(meta.pageIndex) || 1
  const sheetLocked = isSheetLockedPage(pageType) && Array.isArray(activeItems) && activeItems.length > 0
  const highCertainty = requiresHighCertaintyLines(pageType)

  let confidence = lineConfidence(raw)
  let description = String(raw.description ?? '').trim()
  let matchedSheetItemId = String(raw.matchedSheetItemId ?? '').trim() || null
  let qty = raw.qty == null || raw.qty === '' ? null : String(raw.qty)
  let rate = raw.rate == null || raw.rate === '' ? null : String(raw.rate)
  let amount = raw.amount == null || raw.amount === '' ? null : String(raw.amount)
  const checkMark = normalizeCheckMark(raw.checkMark)

  if (sheetLocked) {
    const matched = matchDraftLineToSheetItem(raw, activeItems)
    if (!matched) return null
    description = matched.item.name
    matchedSheetItemId = matched.item.id
    const sheetRate = sheetPriceToRate(matched.item.price)
    if ((!rate || rate === '0') && sheetRate) rate = sheetRate
    if (!qty) qty = '1'
    if (confidence == null) confidence = matched.score
    // Front checklist: keep only reasonably confident matches
    if (confidence < SERVICE_LOG_SHEET_MATCH_THRESHOLD) return null
  }
  else if (highCertainty) {
    if (confidence == null || confidence < SERVICE_LOG_HIGH_CERTAINTY_THRESHOLD) return null
    if (!description) return null
    // Optional soft match to sheet for pricing when clearly the same item
    const matched = matchDraftLineToSheetItem(raw, activeItems)
    if (matched && matched.score >= 0.9) {
      matchedSheetItemId = matched.item.id
      if ((!rate || rate === '0') && sheetPriceToRate(matched.item.price)) {
        rate = sheetPriceToRate(matched.item.price)
      }
    }
  }

  if (!description) return null

  return {
    description,
    qty,
    rate,
    amount,
    confidence,
    matchedSheetItemId,
    sourcePageIndex: pageIndex,
    sourceFileId: meta.fileId || null,
    pageType,
    checkMark,
  }
}

/** Merge per-page extraction JSON into one suggestion payload. */
export function mergeServiceLogPageExtractions(pages, primaryFileId, options = {}) {
  const list = Array.isArray(pages) ? pages : []
  const activeItems = Array.isArray(options.activeSheetItems)
    ? options.activeSheetItems
    : flattenActiveSheetItems(options.sheetDocument)

  const draftLineItems = []
  const checkMarks = []
  const seenKeys = new Set()

  for (let index = 0; index < list.length; index++) {
    const page = list[index]
    const pageIndex = Number(page?.pageIndex) || (index + 1)
    const items = page?.draftLineItems
    if (!Array.isArray(items)) continue

    for (const item of items) {
      const normalized = normalizeDraftLine(item, {
        pageIndex,
        pageType: page?.pageType,
        fileId: page?.fileId ? String(page.fileId) : null,
      }, activeItems)
      if (!normalized) continue

      const dedupeKey = [
        normalized.matchedSheetItemId || '',
        normalizeMatchText(normalized.description),
        normalized.sourceFileId || '',
      ].join('|')
      if (seenKeys.has(dedupeKey)) continue
      seenKeys.add(dedupeKey)

      draftLineItems.push(normalized)
      if (normalized.checkMark && normalized.sourceFileId) {
        checkMarks.push({
          fileId: normalized.sourceFileId,
          x: normalized.checkMark.x,
          y: normalized.checkMark.y,
          description: normalized.description,
          matchedSheetItemId: normalized.matchedSheetItemId,
          confidence: normalized.confidence,
        })
      }
    }
  }

  return {
    complaint: joinUniqueText(list.map(p => p?.complaint)),
    internalNotes: joinUniqueText(list.map(p => p?.internalNotes)),
    draftLineItems: draftLineItems.length ? draftLineItems : undefined,
    checkMarks: checkMarks.length ? checkMarks : undefined,
    fileId: primaryFileId || list[0]?.fileId || undefined,
    pageResults: list.map((page, index) => ({
      pageIndex: Number(page?.pageIndex) || (index + 1),
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
