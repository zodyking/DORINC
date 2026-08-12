/**
 * Catalog AI helpers — auto-sort categories + mine commonly billed invoice lines.
 * Side/location abbreviations are stripped before matching so L/S and R/S variants group together.
 */
import { stripLocationAbbreviations } from './format/abbreviations'
import { toTitleCase } from './format/title-case'
import { inferCatalogCategory, type CatalogCategoryOption } from './catalog-category-inference'
import {
  inferLineTypeFromDescription,
  type LineTypeVerbConfig,
} from './line-item-type-from-description'
import type { CatalogKeywordMap } from './workspace-settings-defaults'
import type { LineItemType } from './line-item-types'
import { formatMoney, parseMoney } from './money'

export interface CatalogItemForSort {
  id: string
  name: string
  description: string | null
  categoryId: string | null
  categoryName: string | null
}

export interface CategorySortProposal {
  itemId: string
  name: string
  description: string | null
  currentCategoryId: string | null
  currentCategoryName: string | null
  suggestedCategoryId: string
  suggestedCategoryName: string
  confidence: number
  selected?: boolean
}

export interface InvoiceLineForMining {
  id: string
  description: string
  lineType: LineItemType | string
  unitPrice: string
  catalogItemId: string | null
}

export interface CatalogItemForMatch {
  id: string
  name: string
  description: string | null
  sku: string | null
}

export interface CommonlyBilledCandidate {
  /** Stable key after stripping side abbreviations. */
  matchKey: string
  /** Suggested catalog name (title case, side abbreviations removed). */
  name: string
  /** Most common raw invoice description seen. */
  sampleDescription: string
  occurrenceCount: number
  suggestedItemType: LineItemType
  suggestedCategoryId: string | null
  suggestedCategoryName: string | null
  suggestedPrice: string | null
  lineTypeCounts: Partial<Record<LineItemType, number>>
  selected?: boolean
}

/** Normalize free text for catalog/invoice matching (strip sides, lowercase, collapse). */
export function catalogMatchKey(text: string): string {
  return stripLocationAbbreviations(text)
    .toLowerCase()
    .replace(/[''"]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

/** Clean invoice description into a catalog item name. */
export function catalogNameFromInvoiceDescription(description: string): string {
  const stripped = stripLocationAbbreviations(description)
  return toTitleCase(stripped) || toTitleCase(description.trim())
}

function medianMoney(values: string[]): string | null {
  const cents: bigint[] = []
  for (const value of values) {
    try {
      cents.push(parseMoney(value))
    }
    catch {
      // skip invalid
    }
  }
  if (!cents.length) return null
  cents.sort((a, b) => (a < b ? -1 : a > b ? 1 : 0))
  const mid = Math.floor(cents.length / 2)
  const pick = cents.length % 2 === 0
    ? (cents[mid - 1]! + cents[mid]!) / 2n
    : cents[mid]!
  return formatMoney(pick)
}

function dominantLineType(
  counts: Partial<Record<LineItemType, number>>,
  fallbackDescription: string,
  verbs?: LineTypeVerbConfig,
): LineItemType {
  const inferred = inferLineTypeFromDescription(fallbackDescription, verbs)
  let best: LineItemType | null = inferred
  let bestCount = inferred ? (counts[inferred] ?? 0) : 0
  for (const type of ['part', 'labor', 'fee'] as const) {
    const n = counts[type] ?? 0
    if (n > bestCount) {
      best = type
      bestCount = n
    }
  }
  return best ?? 'labor'
}

/**
 * Propose category assignments for catalog items using keyword detection.
 * Defaults to uncategorized items only; pass `uncategorizedOnly: false` to re-score all.
 */
export function buildCategorySortProposals(
  items: CatalogItemForSort[],
  categories: CatalogCategoryOption[],
  keywordMap?: CatalogKeywordMap | null,
  opts: { uncategorizedOnly?: boolean; minConfidence?: number } = {},
): CategorySortProposal[] {
  const uncategorizedOnly = opts.uncategorizedOnly !== false
  const minConfidence = opts.minConfidence ?? 0
  const proposals: CategorySortProposal[] = []

  for (const item of items) {
    if (uncategorizedOnly && item.categoryId) continue
    const text = [item.name, item.description].filter(Boolean).join(' ')
    // Match on side-stripped text so "Marker Light R/S" still hits Lighting.
    const matchText = stripLocationAbbreviations(text) || text
    const inferred = inferCatalogCategory(matchText, categories, keywordMap)
    if (!inferred) continue
    if (inferred.confidence < minConfidence) continue
    if (item.categoryId && item.categoryId === inferred.categoryId) continue

    proposals.push({
      itemId: item.id,
      name: item.name,
      description: item.description,
      currentCategoryId: item.categoryId,
      currentCategoryName: item.categoryName,
      suggestedCategoryId: inferred.categoryId,
      suggestedCategoryName: inferred.categoryName,
      confidence: inferred.confidence,
      selected: true,
    })
  }

  proposals.sort((a, b) => b.confidence - a.confidence || a.name.localeCompare(b.name))
  return proposals
}

/**
 * Aggregate invoice line descriptions into commonly billed catalog candidates.
 * Side abbreviations are stripped before grouping. Lines that already match a
 * catalog item (by id or by name key) are excluded.
 */
export function buildCommonlyBilledCandidates(
  lines: InvoiceLineForMining[],
  catalogItems: CatalogItemForMatch[],
  categories: CatalogCategoryOption[],
  opts: {
    minOccurrences?: number
    limit?: number
    keywordMap?: CatalogKeywordMap | null
    verbs?: LineTypeVerbConfig
    /** When true, only mine lines that were not linked to a catalog item. */
    unlinkedOnly?: boolean
  } = {},
): CommonlyBilledCandidate[] {
  const minOccurrences = opts.minOccurrences ?? 2
  const limit = opts.limit ?? 50
  const unlinkedOnly = opts.unlinkedOnly !== false

  const catalogKeys = new Set<string>()
  for (const item of catalogItems) {
    const keys = [item.name, item.description, item.sku]
      .filter(Boolean)
      .map(v => catalogMatchKey(String(v)))
      .filter(Boolean)
    for (const key of keys) catalogKeys.add(key)
  }

  type Bucket = {
    matchKey: string
    samples: Map<string, number>
    prices: string[]
    lineTypeCounts: Partial<Record<LineItemType, number>>
    occurrenceCount: number
  }

  const buckets = new Map<string, Bucket>()

  for (const line of lines) {
    if (unlinkedOnly && line.catalogItemId) continue
    const description = line.description?.trim()
    if (!description) continue

    const matchKey = catalogMatchKey(description)
    if (!matchKey || matchKey.length < 3) continue
    if (catalogKeys.has(matchKey)) continue

    let bucket = buckets.get(matchKey)
    if (!bucket) {
      bucket = {
        matchKey,
        samples: new Map(),
        prices: [],
        lineTypeCounts: {},
        occurrenceCount: 0,
      }
      buckets.set(matchKey, bucket)
    }

    bucket.occurrenceCount += 1
    bucket.samples.set(description, (bucket.samples.get(description) ?? 0) + 1)
    if (line.unitPrice) bucket.prices.push(line.unitPrice)

    const lt = (line.lineType === 'part' || line.lineType === 'fee' || line.lineType === 'labor')
      ? line.lineType
      : 'labor'
    bucket.lineTypeCounts[lt] = (bucket.lineTypeCounts[lt] ?? 0) + 1
  }

  const candidates: CommonlyBilledCandidate[] = []

  for (const bucket of buckets.values()) {
    if (bucket.occurrenceCount < minOccurrences) continue

    let sampleDescription = ''
    let sampleCount = 0
    for (const [sample, count] of bucket.samples) {
      if (count > sampleCount) {
        sampleDescription = sample
        sampleCount = count
      }
    }

    const name = catalogNameFromInvoiceDescription(sampleDescription)
    const suggestedItemType = dominantLineType(bucket.lineTypeCounts, name, opts.verbs)
    const inferred = inferCatalogCategory(
      stripLocationAbbreviations(name) || name,
      categories,
      opts.keywordMap,
    )

    candidates.push({
      matchKey: bucket.matchKey,
      name,
      sampleDescription,
      occurrenceCount: bucket.occurrenceCount,
      suggestedItemType,
      suggestedCategoryId: inferred?.categoryId ?? null,
      suggestedCategoryName: inferred?.categoryName ?? null,
      suggestedPrice: medianMoney(bucket.prices),
      lineTypeCounts: bucket.lineTypeCounts,
      selected: true,
    })
  }

  candidates.sort((a, b) => b.occurrenceCount - a.occurrenceCount || a.name.localeCompare(b.name))
  return candidates.slice(0, limit)
}
