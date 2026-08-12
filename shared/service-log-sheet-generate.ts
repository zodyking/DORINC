/**
 * Service-log sheet generation helpers — demand scoring + capacity-aware packing
 * so generated catalogs fit page 1 with QR void space on the right.
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
 * Pick the top-scoring candidates that can fit under target capacity with
 * room for section titles and QR void on the right.
 */
export function selectCandidatesForSheetCapacity(
  ranked: SheetDemandCandidate[],
  opts: {
    targetCapacity?: number
    minQrVoid?: number
    maxItems?: number
  } = {},
): SheetDemandCandidate[] {
  const target = opts.targetCapacity ?? SHEET_GENERATE_TARGET_CAPACITY
  const minQr = opts.minQrVoid ?? SHEET_GENERATE_MIN_QR_VOID_ROWS
  const maxItems = opts.maxItems ?? 48

  // Reserve ~1 row per ~4 items for section titles, plus QR void on the longer side budget.
  const usable = Math.max(12, target - minQr - 2)
  const selected: SheetDemandCandidate[] = []
  let itemWeight = 0

  for (const candidate of ranked) {
    if (selected.length >= maxItems) break
    const w = rowWeightForItem(!!candidate.description?.trim())
    // Approximate title overhead as 1 per 5 items.
    const titleOverhead = Math.ceil((selected.length + 1) / 5)
    if (itemWeight + w + titleOverhead > usable) {
      if (selected.length >= 12) break
      continue
    }
    selected.push(candidate)
    itemWeight += w
  }

  return selected
}

/**
 * Pack proposed sections into left/right columns, preferring a heavier left
 * column so the right trailing void can hold the QR.
 */
export function packSectionsIntoDocument(
  sections: Array<{ title: string, itemIds: string[] }>,
  itemsById: Map<string, SheetDemandCandidate>,
  opts: {
    targetCapacity?: number
    minQrVoid?: number
  } = {},
): ServiceLogSheetDocument {
  const target = opts.targetCapacity ?? SHEET_GENERATE_TARGET_CAPACITY
  const minQr = opts.minQrVoid ?? SHEET_GENERATE_MIN_QR_VOID_ROWS

  type Built = { title: string, items: SheetDemandCandidate[], weight: number }
  const built: Built[] = []

  for (const section of sections) {
    const items = section.itemIds
      .map(id => itemsById.get(id))
      .filter((item): item is SheetDemandCandidate => !!item)
    if (!items.length) continue
    const noteCount = items.filter(i => i.description?.trim()).length
    built.push({
      title: section.title.trim() || 'Services',
      items,
      weight: sectionWeight(items.length, noteCount),
    })
  }

  // Heavier / longer sections first for packing onto left.
  built.sort((a, b) => b.weight - a.weight || b.items.length - a.items.length)

  const left: Built[] = []
  const right: Built[] = []
  let leftWeight = 0
  let rightWeight = 0

  for (const section of built) {
    // Prefer left until it is ahead of right by minQr (QR void), then fill right.
    const leftAhead = leftWeight - rightWeight
    const putLeft = leftAhead < minQr || leftWeight <= rightWeight
    if (putLeft) {
      left.push(section)
      leftWeight += section.weight
    }
    else {
      right.push(section)
      rightWeight += section.weight
    }
  }

  // If still overflowing, drop lowest-score items from the heavier column.
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
  while ((fill.overflows || fill.rows > target) && guard < 80) {
    guard += 1
    const heavier = leftWeight >= rightWeight ? left : right
    const section = heavier[heavier.length - 1]
    if (!section || !section.items.length) break
    // Drop the last (lowest priority within section — already score-sorted upstream).
    const removed = section.items.pop()!
    const note = !!removed.description?.trim()
    const delta = rowWeightForItem(note)
    if (heavier === left) leftWeight -= delta
    else rightWeight -= delta
    if (!section.items.length) {
      heavier.pop()
      if (heavier === left) leftWeight -= 1
      else rightWeight -= 1
    }
    document = toDoc()
    fill = sheetFrontPageFill(document)
  }

  // Ensure QR void: if right is not shorter, move a small section or trim right.
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
  while (guard < 60) {
    guard += 1
    const voidInfo = sheetRightTrailingVoid(clone)
    if (voidInfo && voidInfo.rowCount >= minQr) return clone

    const rightSections = clone.sections.filter(s => s.column === 'right')
    const last = rightSections[rightSections.length - 1]
    if (!last) {
      // No right content — void is entire left height; OK if left has rows.
      return clone
    }
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
  const name = (categoryName ?? '').trim()
  if (!name) return 'Services'
  // Keep short shop-friendly titles.
  const simple = name
    .replace(/\s+&\s+/g, ' & ')
    .replace(/\bAnd\b/gi, '&')
  if (simple.length <= 28) return simple
  return simple.split(/[&,]/)[0]!.trim() || 'Services'
}

/** Group candidates by category for deterministic (non-AI) sectioning. */
export function groupCandidatesByCategory(
  candidates: SheetDemandCandidate[],
): Array<{ title: string, itemIds: string[] }> {
  const map = new Map<string, SheetDemandCandidate[]>()
  for (const item of candidates) {
    const key = fallbackSectionTitle(item.categoryName)
    const list = map.get(key) ?? []
    list.push(item)
    map.set(key, list)
  }
  return [...map.entries()]
    .map(([title, items]) => ({
      title,
      itemIds: items.map(i => i.catalogItemId),
    }))
    .sort((a, b) => b.itemIds.length - a.itemIds.length || a.title.localeCompare(b.title))
}

/** Match helpers exported for invoice aggregation in the service layer. */
export { catalogMatchKey, catalogMatchKeyLoose }
