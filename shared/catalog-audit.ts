/**
 * Catalog audit — wording fixes, part/labor type correction, uncategorized
 * suggestions, and duplicate detection for human review.
 */
import { formatFieldText } from './format/prose-field'
import { inferCatalogCategory, type CatalogCategoryOption } from './catalog-category-inference'
import {
  inferLineTypeFromDescription,
  type LineTypeVerbConfig,
} from './line-item-type-from-description'
import type { LineItemType } from './line-item-types'
import type { CatalogKeywordMap } from './workspace-settings-defaults'
import {
  catalogMatchKey,
  catalogMatchKeyLoose,
} from './catalog-ai'

export type CatalogAuditIssueKind = 'wording' | 'type' | 'uncategorized' | 'duplicate'

export interface CatalogAuditItem {
  id: string
  itemType: LineItemType | string
  name: string
  description: string | null
  categoryId: string | null
  categoryName: string | null
  uom: string
}

export interface CatalogAuditDuplicatePeer {
  itemId: string
  name: string
  itemType: LineItemType
  categoryName: string | null
}

export interface CatalogAuditFinding {
  /** Stable UI id (itemId, or `dup:<key>` for duplicate groups). */
  id: string
  kinds: CatalogAuditIssueKind[]
  itemId: string
  name: string
  description: string | null
  currentItemType: LineItemType
  currentCategoryId: string | null
  currentCategoryName: string | null
  currentUom: string
  suggestedName: string | null
  suggestedDescription: string | null
  suggestedItemType: LineItemType | null
  suggestedCategoryId: string | null
  suggestedCategoryName: string | null
  suggestedUom: string | null
  /** Other catalog rows that look like duplicates (duplicate findings only). */
  duplicates: CatalogAuditDuplicatePeer[]
  /** Pre-selected when auto-fixable. */
  selected: boolean
  autoFixable: boolean
}

export interface CatalogAuditApplyFix {
  itemId: string
  name?: string
  description?: string | null
  itemType?: LineItemType
  categoryId?: string | null
  uom?: string
}

export interface CatalogAuditApplyDuplicate {
  keepItemId: string
  archiveItemIds: string[]
}

function normalizeStoredType(value: string): LineItemType {
  if (value === 'part' || value === 'labor' || value === 'fee') return value
  if (value === 'service') return 'labor'
  return 'labor'
}

function defaultUomForType(type: LineItemType): string {
  if (type === 'labor') return 'hr'
  if (type === 'fee') return 'pct'
  return 'each'
}

function comparableDescription(value: string | null | undefined): string | null {
  if (value == null) return null
  const trimmed = value.trim()
  return trimmed.length ? trimmed : null
}

/**
 * Build audit findings for catalog items.
 * - wording: invoice-editor prose formatting (title case + location abbr)
 * - type: Line Detection verb → part/labor/fee when it disagrees
 * - uncategorized: missing category (+ keyword suggestion when available)
 * - duplicate: near-matching names (filler-stripped / exact match keys)
 */
export function buildCatalogAuditFindings(
  items: CatalogAuditItem[],
  categories: CatalogCategoryOption[],
  opts: {
    keywordMap?: CatalogKeywordMap | null
    verbs?: LineTypeVerbConfig
  } = {},
): CatalogAuditFinding[] {
  const active = items.filter(i => i.name?.trim())
  const findings: CatalogAuditFinding[] = []

  // Duplicate groups by loose match key.
  const groups = new Map<string, CatalogAuditItem[]>()
  for (const item of active) {
    const loose = catalogMatchKeyLoose(item.name) || catalogMatchKey(item.name)
    if (!loose || loose.length < 3) continue
    const list = groups.get(loose) ?? []
    list.push(item)
    groups.set(loose, list)
  }

  for (const [key, group] of groups) {
    if (group.length < 2) continue
    const sorted = [...group].sort((a, b) => a.name.localeCompare(b.name) || a.id.localeCompare(b.id))

    const keep = sorted[0]!
    const peers = sorted.slice(1).map(p => ({
      itemId: p.id,
      name: p.name,
      itemType: normalizeStoredType(String(p.itemType)),
      categoryName: p.categoryName,
    }))

    findings.push({
      id: `dup:${key}`,
      kinds: ['duplicate'],
      itemId: keep.id,
      name: keep.name,
      description: keep.description,
      currentItemType: normalizeStoredType(String(keep.itemType)),
      currentCategoryId: keep.categoryId,
      currentCategoryName: keep.categoryName,
      currentUom: keep.uom,
      suggestedName: null,
      suggestedDescription: null,
      suggestedItemType: null,
      suggestedCategoryId: null,
      suggestedCategoryName: null,
      suggestedUom: null,
      duplicates: peers,
      selected: false,
      autoFixable: false,
    })
  }

  for (const item of active) {
    const currentType = normalizeStoredType(String(item.itemType))
    const kinds: CatalogAuditIssueKind[] = []

    const formattedName = formatFieldText(item.name, 'prose')
    const suggestedName = formattedName !== item.name ? formattedName : null

    const currentDesc = comparableDescription(item.description)
    const formattedDesc = currentDesc ? formatFieldText(currentDesc, 'prose') : null
    const suggestedDescription = formattedDesc && formattedDesc !== currentDesc
      ? formattedDesc
      : null

    if (suggestedName || suggestedDescription) kinds.push('wording')

    let suggestedItemType: LineItemType | null = null
    let suggestedUom: string | null = null
    const typeSource = suggestedName ?? item.name
    const inferred = inferLineTypeFromDescription(typeSource, opts.verbs)
    if (inferred && inferred !== currentType) {
      suggestedItemType = inferred
      kinds.push('type')
      const oldDefault = defaultUomForType(currentType)
      const newDefault = defaultUomForType(inferred)
      if (item.uom === oldDefault && oldDefault !== newDefault) {
        suggestedUom = newDefault
      }
    }

    let suggestedCategoryId: string | null = null
    let suggestedCategoryName: string | null = null
    if (!item.categoryId) {
      kinds.push('uncategorized')
      const text = [suggestedName ?? item.name, suggestedDescription ?? item.description]
        .filter(Boolean)
        .join(' ')
      const inferredCat = inferCatalogCategory(text, categories, opts.keywordMap)
      if (inferredCat) {
        suggestedCategoryId = inferredCat.categoryId
        suggestedCategoryName = inferredCat.categoryName
      }
    }

    if (!kinds.length) continue

    // Duplicate-only membership is covered by the group card; still show if this row
    // has wording/type/category issues of its own.
    const autoFixable = kinds.includes('wording')
      || kinds.includes('type')
      || (kinds.includes('uncategorized') && !!suggestedCategoryId)

    findings.push({
      id: item.id,
      kinds,
      itemId: item.id,
      name: item.name,
      description: item.description,
      currentItemType: currentType,
      currentCategoryId: item.categoryId,
      currentCategoryName: item.categoryName,
      currentUom: item.uom,
      suggestedName,
      suggestedDescription,
      suggestedItemType,
      suggestedCategoryId,
      suggestedCategoryName,
      suggestedUom,
      duplicates: [],
      selected: autoFixable,
      autoFixable,
    })
  }

  const kindOrder: Record<CatalogAuditIssueKind, number> = {
    type: 0,
    wording: 1,
    uncategorized: 2,
    duplicate: 3,
  }
  findings.sort((a, b) => {
    const ak = Math.min(...a.kinds.map(k => kindOrder[k]))
    const bk = Math.min(...b.kinds.map(k => kindOrder[k]))
    return ak - bk || a.name.localeCompare(b.name)
  })

  return findings
}

/** Map a reviewed item finding into an apply patch (not for duplicate groups). */
export function catalogAuditFindingToFix(
  finding: CatalogAuditFinding,
  overrides: {
    name?: string
    description?: string | null
    itemType?: LineItemType | ''
    categoryId?: string | null
    uom?: string
  } = {},
): CatalogAuditApplyFix | null {
  if (finding.kinds.length === 1 && finding.kinds[0] === 'duplicate') return null

  const fix: CatalogAuditApplyFix = { itemId: finding.itemId }
  let changed = false

  const name = overrides.name ?? finding.suggestedName ?? undefined
  if (name && name !== finding.name) {
    fix.name = name
    changed = true
  }

  const description = 'description' in overrides
    ? overrides.description
    : finding.suggestedDescription
  if (description !== undefined && description !== comparableDescription(finding.description)) {
    fix.description = description
    changed = true
  }

  const itemType = overrides.itemType || finding.suggestedItemType || undefined
  if (itemType && itemType !== finding.currentItemType) {
    fix.itemType = itemType
    changed = true
  }

  const categoryId = 'categoryId' in overrides
    ? overrides.categoryId
    : finding.suggestedCategoryId
  if (categoryId !== undefined && categoryId !== finding.currentCategoryId) {
    fix.categoryId = categoryId
    changed = true
  }

  const uom = overrides.uom ?? finding.suggestedUom ?? undefined
  if (uom && uom !== finding.currentUom) {
    fix.uom = uom
    changed = true
  }

  return changed ? fix : null
}
