/**
 * Service-log sheet generation helpers — demand scoring + capacity-aware packing
 * so generated catalogs fit page 1 with QR void space on the right.
 *
 * Sectioning follows the classic Devon Onsite / DORINC Letter template taxonomy
 * (Cleaning, Seats, Lights, Filters, Brakes and Hub Seals, …) so generated
 * sheets stay dense and shop-recognizable — not vague AI labels like "Body".
 */
import type {
  ServiceLogSheetDocument,
  ServiceLogSheetLine,
  ServiceLogSheetSection,
} from './service-log-sheet-default'
import {
  sectionsByColumn,
  sheetColumnRows,
  sheetFrontPageFill,
  sheetRightTrailingVoid,
  SHEET_FRONT_PAGE_ROW_CAPACITY,
} from './service-log-sheet-layout'
import { catalogMatchKey, catalogMatchKeyLoose } from './catalog-ai'

/** Keep a little headroom under the hard 43-row cap. */
export const SHEET_GENERATE_TARGET_CAPACITY = 40

/** Right column must stay shorter so trailing void can seat the QR (≥3 rows). */
export const SHEET_GENERATE_MIN_QR_VOID_ROWS = 3

/**
 * Classic Letter-sheet sections from the shop PDF / default template.
 * Preferred column + print order match the physical DORINC sheet.
 */
export const SHEET_CLASSIC_SECTIONS = [
  {
    title: 'Cleaning',
    column: 'left' as const,
    order: 10,
    keywords: [
      'clean', 'wash', 'steam', 'detail', 'interior clean', 'outside clean',
    ],
  },
  {
    title: 'Seats',
    column: 'left' as const,
    order: 20,
    keywords: [
      'seat', 'cushion', 'seat belt', 'belts on top', 'loose seat',
    ],
  },
  {
    title: 'Lights',
    column: 'left' as const,
    order: 30,
    keywords: [
      'light', 'bulb', 'led', 'headlight', 'marker', 'signal light',
      'brake light', 'reverse light', 'dashboard light', 'sign light',
      'state warning', 'tail light',
    ],
  },
  {
    title: 'Filters',
    column: 'left' as const,
    order: 40,
    keywords: [
      'filter', 'water separator', 'oil and oil', 'air filter', 'fuel filter',
    ],
  },
  {
    title: 'Brakes and Hub Seals',
    column: 'left' as const,
    order: 50,
    keywords: [
      'brake', 'hub seal', 'brake chamber', 'adjust all brakes', 'abs',
    ],
  },
  {
    title: 'Springs, Shocks and Exhaust',
    column: 'left' as const,
    order: 60,
    keywords: [
      'spring', 'shock', 'muffler', 'exhaust', 'king pin', 'shackle',
      'bushing', 'leaf spring',
    ],
  },
  {
    title: 'Battery',
    column: 'right' as const,
    order: 70,
    keywords: ['battery', 'cranking amp', 'alternator'],
  },
  {
    title: 'Oil Pump and Turbocharger',
    column: 'right' as const,
    order: 80,
    keywords: [
      'oil pump', 'turbo', 'turbocharger', 'high-pressure oil', 'high pressure oil',
      'hpops',
    ],
  },
  {
    title: 'Mirrors and Safety Supplies',
    column: 'right' as const,
    order: 90,
    keywords: [
      'mirror', 'first aid', 'fire extinguisher', 'safety supply', 'west coast',
      'crossover mirror',
    ],
  },
  {
    title: 'MaxxForce Diagnostics',
    column: 'right' as const,
    order: 100,
    keywords: ['maxxforce', 'maxx force', 'maxforce'],
  },
  {
    title: 'Tires',
    column: 'right' as const,
    order: 110,
    keywords: ['tire', 'tyre', 'recap', 'wheel'],
  },
  {
    title: 'Heaters',
    column: 'right' as const,
    order: 120,
    keywords: ['heater', 'defrost', 'heat motor'],
  },
  {
    title: 'Inspection',
    column: 'right' as const,
    order: 130,
    keywords: ['inspection', 'dot inspect', 'pm service', 'preventive'],
  },
  {
    title: 'Body and Doors',
    column: 'left' as const,
    order: 140,
    keywords: [
      'door', 'bumper', 'body', 'panel', 'hinge', 'latch', 'glass', 'window',
      'wiper',
    ],
  },
  {
    title: 'Fluids and Lube',
    column: 'right' as const,
    order: 150,
    keywords: [
      'lube', 'antifreeze', 'coolant', 'transmission fluid', 'gear oil',
      'power steering fluid', 'fluid',
    ],
  },
] as const

export type SheetClassicSectionTitle = (typeof SHEET_CLASSIC_SECTIONS)[number]['title']

/** Allowed leftover titles when nothing classic matches (keep shop-like). */
export const SHEET_ALLOWED_EXTRA_TITLES = [
  'Electrical',
  'Engine',
  'Transmission',
  'Suspension',
  'Steering',
  'Air System',
  'Other Services',
] as const

export interface SheetDemandCandidate {
  catalogItemId: string
  name: string
  description: string | null
  price: string
  itemType: string
  categoryName: string | null
  /** Times billed on invoices (linked + name-matched). */
  occurrenceCount: number
  /** Combined demand score (higher = better). */
  score: number
}

export interface SheetProposedSection {
  title: string
  column: 'left' | 'right'
  itemIds: string[]
}

function newId(prefix: string): string {
  return `${prefix}-${Math.random().toString(36).slice(2, 10)}`
}

function rowWeightForItem(hasNote: boolean): number {
  return hasNote ? 1.45 : 1
}

function normalizeMatchText(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

/** Title row + item rows weight for a proposed section. */
export function sectionWeight(
  itemCount: number,
  noteCount = 0,
): number {
  const plain = Math.max(0, itemCount - noteCount)
  return 1 + plain * 1 + noteCount * 1.45
}

/**
 * Score catalog items by invoice demand.
 * score = occurrenceCount * 10 + uniqueness bonus for higher frequency tiers.
 */
export function scoreSheetDemandCandidate(input: {
  occurrenceCount: number
  itemType: string
}): number {
  const count = Math.max(0, input.occurrenceCount)
  let score = count * 10
  if (count >= 50) score += 40
  else if (count >= 20) score += 20
  else if (count >= 5) score += 8
  // Prefer part/labor checklist services over pure fees for the sheet.
  if (input.itemType === 'fee') score = Math.round(score * 0.55)
  // Mild boost so never-billed catalog can still backfill empty sections.
  if (count === 0) score = input.itemType === 'fee' ? 1 : 2
  return score
}

/** Sort candidates highest-score first. */
export function rankSheetDemandCandidates(
  candidates: SheetDemandCandidate[],
): SheetDemandCandidate[] {
  return [...candidates].sort(
    (a, b) => b.score - a.score
      || b.occurrenceCount - a.occurrenceCount
      || a.name.localeCompare(b.name),
  )
}

/**
 * Map an item name (+ optional category) onto a classic DORINC section title.
 * Prefer specific matches (MaxxForce, Oil Pump) before broad ones (Filters, Brakes).
 */
export function matchClassicSectionTitle(
  name: string,
  categoryName?: string | null,
): string | null {
  const hay = normalizeMatchText(`${name} ${categoryName ?? ''}`)
  if (!hay) return null

  // Specific overrides first — avoid Lights stealing "brake light" into Brakes, etc.
  const ordered = [...SHEET_CLASSIC_SECTIONS].sort((a, b) => {
    // Longer / more specific keyword sets first via max keyword length.
    const aMax = Math.max(...a.keywords.map(k => k.length))
    const bMax = Math.max(...b.keywords.map(k => k.length))
    return bMax - aMax || a.order - b.order
  })

  for (const section of ordered) {
    for (const keyword of section.keywords) {
      if (hay.includes(keyword)) {
        // Disambiguate brake *lights* vs brakes.
        if (section.title === 'Brakes and Hub Seals') {
          if (/\b(light|bulb|led)\b/.test(hay) && !/\b(hub|chamber|adjust)\b/.test(hay)) {
            continue
          }
        }
        // MaxxForce filters belong to MaxxForce, not Filters.
        if (section.title === 'Filters' && /maxx?\s*force/.test(hay)) {
          continue
        }
        // Seat belts / cushions → Seats; generic "belts" alone may be cleaning/other.
        if (section.title === 'Seats' && keyword === 'seat') {
          // ok
        }
        return section.title
      }
    }
  }

  // Category name exact classic match.
  const cat = normalizeMatchText(categoryName ?? '')
  for (const section of SHEET_CLASSIC_SECTIONS) {
    if (cat === normalizeMatchText(section.title)) return section.title
  }

  return null
}

export function classicSectionMeta(title: string) {
  return SHEET_CLASSIC_SECTIONS.find(s => s.title === title) ?? null
}

/**
 * Pick candidates that fill toward target capacity with room for section titles
 * and QR void. Prefers billed demand, then backfills so the sheet stays dense
 * like the classic Letter PDF (~35–40 rows used).
 */
export function selectCandidatesForSheetCapacity(
  ranked: SheetDemandCandidate[],
  opts: {
    targetCapacity?: number
    minQrVoid?: number
    maxItems?: number
    /** Prefer at least this many items when demand exists (inclusive sheets). */
    minItems?: number
  } = {},
): SheetDemandCandidate[] {
  const target = opts.targetCapacity ?? SHEET_GENERATE_TARGET_CAPACITY
  const minQr = opts.minQrVoid ?? SHEET_GENERATE_MIN_QR_VOID_ROWS
  const maxItems = opts.maxItems ?? 56
  const minItems = opts.minItems ?? 28

  // Budget for item rows + ~1 title per ~4 items. Leave QR void + 1 row slack.
  const usable = Math.max(24, target - minQr - 1)
  const selected: SheetDemandCandidate[] = []
  const selectedIds = new Set<string>()
  let itemWeight = 0
  let titleEstimate = 0

  const tryAdd = (candidate: SheetDemandCandidate): boolean => {
    if (selectedIds.has(candidate.catalogItemId)) return false
    if (selected.length >= maxItems) return false
    const w = rowWeightForItem(!!candidate.description?.trim())
    const nextTitles = Math.ceil((selected.length + 1) / 4)
    const projected = itemWeight + w + nextTitles
    // Always allow growth until minItems when we still have clear headroom vs hard cap.
    const hardCeiling = SHEET_FRONT_PAGE_ROW_CAPACITY - minQr
    if (projected > usable && selected.length >= minItems) return false
    if (projected > hardCeiling) return false
    selected.push(candidate)
    selectedIds.add(candidate.catalogItemId)
    itemWeight += w
    titleEstimate = nextTitles
    return true
  }

  // Pass 1: billed demand (occurrence > 0), score order.
  for (const candidate of ranked) {
    if (candidate.occurrenceCount < 1) continue
    tryAdd(candidate)
  }

  // Pass 2: backfill never-billed catalog to densify toward a full Letter page.
  if (selected.length < minItems || itemWeight + titleEstimate < usable - 2) {
    for (const candidate of ranked) {
      if (candidate.occurrenceCount >= 1) continue
      if (!tryAdd(candidate)) {
        if (selected.length >= minItems && itemWeight + titleEstimate >= usable - 2) break
      }
    }
  }

  return selected
}

/**
 * Group selected candidates into classic DORINC sections (deterministic).
 * Leftovers go into allowed extra titles derived from category, else Other Services.
 */
export function groupCandidatesByClassicSections(
  candidates: SheetDemandCandidate[],
): Array<{ title: string, itemIds: string[], column: 'left' | 'right' }> {
  const buckets = new Map<string, SheetDemandCandidate[]>()

  for (const item of candidates) {
    const classic = matchClassicSectionTitle(item.name, item.categoryName)
    const title = classic
      ?? mapLeftoverTitle(item.categoryName)
    const list = buckets.get(title) ?? []
    list.push(item)
    buckets.set(title, list)
  }

  const result: Array<{ title: string, itemIds: string[], column: 'left' | 'right' }> = []
  for (const [title, items] of buckets) {
    const meta = classicSectionMeta(title)
    const column = meta?.column
      ?? (title === 'Other Services' || title === 'Electrical' ? 'right' : 'left')
    // Keep demand order within section.
    items.sort((a, b) => b.score - a.score || a.name.localeCompare(b.name))
    result.push({
      title,
      column,
      itemIds: items.map(i => i.catalogItemId),
    })
  }

  return result.sort((a, b) => {
    const ao = classicSectionMeta(a.title)?.order ?? 900
    const bo = classicSectionMeta(b.title)?.order ?? 900
    return ao - bo || a.title.localeCompare(b.title)
  })
}

function mapLeftoverTitle(categoryName: string | null | undefined): string {
  const cat = normalizeMatchText(categoryName ?? '')
  if (!cat) return 'Other Services'
  for (const allowed of SHEET_ALLOWED_EXTRA_TITLES) {
    if (cat.includes(normalizeMatchText(allowed)) || normalizeMatchText(allowed).includes(cat)) {
      return allowed
    }
  }
  // Short category as last resort if it looks shop-like.
  const raw = (categoryName ?? '').trim()
  if (raw && raw.length <= 22 && !/^uncategor/i.test(raw) && !/^misc/i.test(raw)) {
    // Avoid vague single words the shop rejected in review UI.
    if (/^(body|service|services|parts|labor|general)$/i.test(raw)) return 'Other Services'
    return raw
  }
  return 'Other Services'
}

/**
 * Pack proposed sections into left/right columns.
 * Classic sections keep their preferred column (PDF layout); others balance fill.
 */
export function packSectionsIntoDocument(
  sections: Array<{ title: string, itemIds: string[], column?: 'left' | 'right' }>,
  itemsById: Map<string, SheetDemandCandidate>,
  opts: {
    targetCapacity?: number
    minQrVoid?: number
  } = {},
): ServiceLogSheetDocument {
  const target = opts.targetCapacity ?? SHEET_GENERATE_TARGET_CAPACITY
  const minQr = opts.minQrVoid ?? SHEET_GENERATE_MIN_QR_VOID_ROWS

  type Built = {
    title: string
    items: SheetDemandCandidate[]
    weight: number
    preferred: 'left' | 'right' | null
    order: number
  }
  const built: Built[] = []

  for (const section of sections) {
    const items = section.itemIds
      .map(id => itemsById.get(id))
      .filter((item): item is SheetDemandCandidate => !!item)
    if (!items.length) continue
    const noteCount = items.filter(i => i.description?.trim()).length
    const meta = classicSectionMeta(section.title)
    built.push({
      title: section.title.trim() || 'Other Services',
      items,
      weight: sectionWeight(items.length, noteCount),
      preferred: section.column ?? meta?.column ?? null,
      order: meta?.order ?? 900,
    })
  }

  // Preserve classic print order within each preferred column.
  built.sort((a, b) => a.order - b.order || b.weight - a.weight)

  const left: Built[] = []
  const right: Built[] = []
  let leftWeight = 0
  let rightWeight = 0

  const place = (section: Built, side: 'left' | 'right') => {
    if (side === 'left') {
      left.push(section)
      leftWeight += section.weight
    }
    else {
      right.push(section)
      rightWeight += section.weight
    }
  }

  // First: honor classic preferred columns.
  const flexible: Built[] = []
  for (const section of built) {
    if (section.preferred === 'left' || section.preferred === 'right') {
      place(section, section.preferred)
    }
    else {
      flexible.push(section)
    }
  }

  // Flexible leftovers: keep left ahead enough for QR void on the right.
  for (const section of flexible) {
    const leftAhead = leftWeight - rightWeight
    const putLeft = leftAhead < minQr || leftWeight <= rightWeight
    place(section, putLeft ? 'left' : 'right')
  }

  // Re-sort each column by classic order for a PDF-like reading experience.
  left.sort((a, b) => a.order - b.order || a.title.localeCompare(b.title))
  right.sort((a, b) => a.order - b.order || a.title.localeCompare(b.title))

  const toDoc = (): ServiceLogSheetDocument => {
    const mapColumn = (list: Built[], column: 'left' | 'right'): ServiceLogSheetSection[] =>
      list.map(section => ({
        id: newId('sec'),
        title: section.title,
        column,
        items: section.items.map((item): ServiceLogSheetLine => ({
          id: newId('item'),
          name: item.name,
          subtext: item.description?.trim() || '',
          price: item.price,
          catalogItemId: item.catalogItemId,
        })),
      }))

    return {
      version: 2,
      sections: [...mapColumn(left, 'left'), ...mapColumn(right, 'right')],
    }
  }

  let document = toDoc()
  let fill = sheetFrontPageFill(document)
  let guard = 0
  while ((fill.overflows || fill.rows > target) && guard < 120) {
    guard += 1
    const heavier = leftWeight >= rightWeight ? left : right
    // Drop lowest-score item from the last / lowest-priority section.
    const section = [...heavier].reverse().find(s => s.items.length)
    if (!section) break
    section.items.sort((a, b) => a.score - b.score || b.name.localeCompare(a.name))
    const removed = section.items.pop()!
    // Restore demand order after trim.
    section.items.sort((a, b) => b.score - a.score || a.name.localeCompare(b.name))
    const note = !!removed.description?.trim()
    const delta = rowWeightForItem(note)
    if (heavier === left) leftWeight -= delta
    else rightWeight -= delta
    if (!section.items.length) {
      const idx = heavier.indexOf(section)
      if (idx >= 0) heavier.splice(idx, 1)
      if (heavier === left) leftWeight -= 1
      else rightWeight -= 1
    }
    document = toDoc()
    fill = sheetFrontPageFill(document)
  }

  document = ensureQrVoid(document, minQr)
  return document
}

function columnWeight(document: ServiceLogSheetDocument, column: 'left' | 'right'): number {
  const { left, right } = sectionsByColumn(document)
  const sections = column === 'left' ? left : right
  return sheetColumnRows(sections).reduce((total, row) => {
    if (row.kind === 'title') return total + 1
    return total + (row.item.subtext.trim() ? 1.45 : 1)
  }, 0)
}

/** Guarantee ≥ minQr trailing right void by trimming right-side items if needed. */
export function ensureQrVoid(
  document: ServiceLogSheetDocument,
  minQr = SHEET_GENERATE_MIN_QR_VOID_ROWS,
): ServiceLogSheetDocument {
  const clone: ServiceLogSheetDocument = structuredClone(document)
  let guard = 0
  while (guard < 80) {
    guard += 1
    const voidInfo = sheetRightTrailingVoid(clone)
    if (voidInfo && voidInfo.rowCount >= minQr) return clone

    const rightSections = clone.sections.filter(s => s.column === 'right')
    const last = rightSections[rightSections.length - 1]
    if (!last) return clone
    if (last.items.length) {
      last.items.pop()
      if (!last.items.length) {
        clone.sections = clone.sections.filter(s => s.id !== last.id)
      }
      continue
    }
    clone.sections = clone.sections.filter(s => s.id !== last.id)
  }
  return clone
}

export function sheetGenerationFitSummary(document: ServiceLogSheetDocument) {
  const fill = sheetFrontPageFill(document)
  const voidInfo = sheetRightTrailingVoid(document)
  const qrRows = voidInfo?.rowCount ?? 0
  return {
    rows: fill.rows,
    capacity: fill.capacity,
    targetCapacity: SHEET_GENERATE_TARGET_CAPACITY,
    overflows: fill.overflows || fill.rows > SHEET_GENERATE_TARGET_CAPACITY,
    qrVoidRows: qrRows,
    qrFits: qrRows >= SHEET_GENERATE_MIN_QR_VOID_ROWS,
    leftWeight: Math.round(columnWeight(document, 'left') * 10) / 10,
    rightWeight: Math.round(columnWeight(document, 'right') * 10) / 10,
    hardCapacity: SHEET_FRONT_PAGE_ROW_CAPACITY,
  }
}

/** Fallback section title from catalog category (simple, non-AI). */
export function fallbackSectionTitle(categoryName: string | null | undefined): string {
  const classic = matchClassicSectionTitle('', categoryName)
  if (classic) return classic
  return mapLeftoverTitle(categoryName)
}

/** Group candidates by category for deterministic (non-AI) sectioning. */
export function groupCandidatesByCategory(
  candidates: SheetDemandCandidate[],
): Array<{ title: string, itemIds: string[] }> {
  return groupCandidatesByClassicSections(candidates).map(({ title, itemIds }) => ({
    title,
    itemIds,
  }))
}

/** Match helpers exported for invoice aggregation in the service layer. */
export { catalogMatchKey, catalogMatchKeyLoose }
