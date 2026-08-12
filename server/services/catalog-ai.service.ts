import { and, asc, eq, inArray, isNull } from 'drizzle-orm'
import type { Db } from '../db/client'
import { catalogCategories, catalogItems, type CatalogItemType } from '../db/schema/catalog'
import { invoiceLineItems } from '../db/schema/invoices'
import {
  buildCategorySortProposals,
  buildCommonlyBilledCandidates,
  type CategorySortProposal,
  type CommonlyBilledCandidate,
} from '../../shared/catalog-ai'
import {
  buildCatalogAuditFindings,
  type CatalogAuditApplyDuplicate,
  type CatalogAuditApplyFix,
  type CatalogAuditFinding,
} from '../../shared/catalog-audit'
import {
  archiveCatalogItem,
  CatalogServiceError,
  createCatalogItem,
  updateCatalogItem,
  type CatalogItemInput,
} from './catalog.service'
import {
  getCatalogKeywordMap,
  getLineTypeVerbs,
} from './workspace-settings.service'

export type CatalogAiServiceErrorCode = 'NOT_FOUND' | 'INVALID_ASSIGNMENT' | 'EMPTY_SELECTION'

export class CatalogAiServiceError extends Error {
  constructor(public readonly code: CatalogAiServiceErrorCode, message?: string) {
    super(message ?? code)
  }
}

export async function proposeCatalogCategorySort(
  db: Db,
  opts: { uncategorizedOnly?: boolean } = {},
): Promise<{ proposals: CategorySortProposal[], scanned: number, categorized: number }> {
  const uncategorizedOnly = opts.uncategorizedOnly !== false
  const [categories, keywordMap] = await Promise.all([
    db.select({
      id: catalogCategories.id,
      name: catalogCategories.name,
    }).from(catalogCategories).where(isNull(catalogCategories.archivedAt))
      .orderBy(asc(catalogCategories.sortOrder), asc(catalogCategories.name)),
    getCatalogKeywordMap(db),
  ])

  if (!categories.length) {
    return { proposals: [], scanned: 0, categorized: 0 }
  }

  const conditions = [isNull(catalogItems.archivedAt)]
  if (uncategorizedOnly) conditions.push(isNull(catalogItems.categoryId))

  const items = await db.select({
    id: catalogItems.id,
    name: catalogItems.name,
    description: catalogItems.description,
    categoryId: catalogItems.categoryId,
    categoryName: catalogCategories.name,
  })
    .from(catalogItems)
    .leftJoin(catalogCategories, eq(catalogItems.categoryId, catalogCategories.id))
    .where(and(...conditions))
    .orderBy(asc(catalogItems.name))

  const proposals = buildCategorySortProposals(items, categories, keywordMap, {
    uncategorizedOnly: false, // already filtered in SQL when needed
  })

  return {
    proposals,
    scanned: items.length,
    categorized: proposals.length,
  }
}

export async function applyCatalogCategorySort(
  db: Db,
  assignments: Array<{ itemId: string, categoryId: string }>,
): Promise<{ updated: number }> {
  if (!assignments.length) throw new CatalogAiServiceError('EMPTY_SELECTION', 'Select at least one item')

  const categoryIds = [...new Set(assignments.map(a => a.categoryId))]
  const categories = await db.select({ id: catalogCategories.id })
    .from(catalogCategories)
    .where(and(
      isNull(catalogCategories.archivedAt),
      inArray(catalogCategories.id, categoryIds),
    ))
  const validCategories = new Set(categories.map(c => c.id))

  let updated = 0
  for (const assignment of assignments) {
    if (!validCategories.has(assignment.categoryId)) {
      throw new CatalogAiServiceError('INVALID_ASSIGNMENT', 'Category not found')
    }
    try {
      const result = await updateCatalogItem(db, assignment.itemId, {
        categoryId: assignment.categoryId,
      })
      if (result.changedFields.includes('categoryId')) updated += 1
    }
    catch {
      throw new CatalogAiServiceError('NOT_FOUND', 'Catalog item not found')
    }
  }

  return { updated }
}

export async function mineCommonlyBilledFromInvoices(
  db: Db,
  opts: {
    minOccurrences?: number
    limit?: number
    unlinkedOnly?: boolean
  } = {},
): Promise<{
  candidates: CommonlyBilledCandidate[]
  scannedLines: number
  minOccurrences: number
  totalMatched: number
  limit: number
}> {
  const minOccurrences = Math.max(1, opts.minOccurrences ?? 2)
  const limit = Math.min(500, Math.max(1, opts.limit ?? 200))
  const unlinkedOnly = opts.unlinkedOnly !== false

  const [categories, keywordMap, verbs, catalogRows, lineRows] = await Promise.all([
    db.select({
      id: catalogCategories.id,
      name: catalogCategories.name,
    }).from(catalogCategories).where(isNull(catalogCategories.archivedAt)),
    getCatalogKeywordMap(db),
    getLineTypeVerbs(db),
    db.select({
      id: catalogItems.id,
      name: catalogItems.name,
      description: catalogItems.description,
      sku: catalogItems.sku,
    }).from(catalogItems).where(isNull(catalogItems.archivedAt)),
    db.select({
      id: invoiceLineItems.id,
      description: invoiceLineItems.description,
      lineType: invoiceLineItems.lineType,
      unitPrice: invoiceLineItems.unitPrice,
      catalogItemId: invoiceLineItems.catalogItemId,
    }).from(invoiceLineItems),
  ])

  const { candidates, totalMatched } = buildCommonlyBilledCandidates(
    lineRows,
    catalogRows,
    categories,
    {
      minOccurrences,
      limit,
      keywordMap,
      verbs,
      unlinkedOnly,
    },
  )

  return {
    candidates,
    scannedLines: lineRows.length,
    minOccurrences,
    totalMatched,
    limit,
  }
}

export interface MinedCatalogItemInput {
  name: string
  itemType: CatalogItemType
  description?: string | null
  categoryId?: string | null
  defaultPrice?: string | null
  taxable?: boolean
  uom?: string
}

export async function addMinedItemsToCatalog(
  db: Db,
  items: MinedCatalogItemInput[],
  actorId: string,
): Promise<{ created: Array<{ id: string, name: string }> }> {
  if (!items.length) throw new CatalogAiServiceError('EMPTY_SELECTION', 'Select at least one item')

  const created: Array<{ id: string, name: string }> = []
  for (const item of items) {
    const input: CatalogItemInput = {
      itemType: item.itemType,
      name: item.name,
      description: item.description ?? null,
      categoryId: item.categoryId ?? null,
      defaultPrice: item.defaultPrice ?? null,
      taxable: item.taxable ?? true,
      uom: item.uom ?? (item.itemType === 'labor' ? 'hr' : 'each'),
    }
    const row = await createCatalogItem(db, input, actorId)
    created.push({ id: row.id, name: row.name })
  }

  return { created }
}

export async function proposeCatalogAudit(db: Db): Promise<{
  findings: CatalogAuditFinding[]
  scanned: number
  summary: {
    wording: number
    type: number
    uncategorized: number
    duplicate: number
  }
}> {
  const [categories, keywordMap, verbs, items] = await Promise.all([
    db.select({
      id: catalogCategories.id,
      name: catalogCategories.name,
    }).from(catalogCategories).where(isNull(catalogCategories.archivedAt))
      .orderBy(asc(catalogCategories.sortOrder), asc(catalogCategories.name)),
    getCatalogKeywordMap(db),
    getLineTypeVerbs(db),
    db.select({
      id: catalogItems.id,
      itemType: catalogItems.itemType,
      name: catalogItems.name,
      description: catalogItems.description,
      categoryId: catalogItems.categoryId,
      categoryName: catalogCategories.name,
      uom: catalogItems.uom,
    })
      .from(catalogItems)
      .leftJoin(catalogCategories, eq(catalogItems.categoryId, catalogCategories.id))
      .where(isNull(catalogItems.archivedAt))
      .orderBy(asc(catalogItems.name)),
  ])

  const findings = buildCatalogAuditFindings(items, categories, { keywordMap, verbs })

  const summary = {
    wording: findings.filter(f => f.kinds.includes('wording')).length,
    type: findings.filter(f => f.kinds.includes('type')).length,
    uncategorized: findings.filter(f => f.kinds.includes('uncategorized')).length,
    duplicate: findings.filter(f => f.kinds.includes('duplicate')).length,
  }

  return { findings, scanned: items.length, summary }
}

export async function applyCatalogAudit(
  db: Db,
  input: {
    fixes: CatalogAuditApplyFix[]
    duplicates: CatalogAuditApplyDuplicate[]
  },
): Promise<{ updated: number, archived: number }> {
  const fixes = input.fixes ?? []
  const duplicates = input.duplicates ?? []
  if (!fixes.length && !duplicates.length) {
    throw new CatalogAiServiceError('EMPTY_SELECTION', 'Select at least one fix')
  }

  let updated = 0
  for (const fix of fixes) {
    const patch: Partial<CatalogItemInput> = {}
    if (fix.name !== undefined) patch.name = fix.name
    if (fix.description !== undefined) patch.description = fix.description
    if (fix.itemType !== undefined) patch.itemType = fix.itemType
    if (fix.categoryId !== undefined) patch.categoryId = fix.categoryId
    if (fix.uom !== undefined) patch.uom = fix.uom

    if (!Object.keys(patch).length) continue
    try {
      const result = await updateCatalogItem(db, fix.itemId, patch)
      if (result.changedFields.length) updated += 1
    }
    catch {
      throw new CatalogAiServiceError('NOT_FOUND', 'Catalog item not found')
    }
  }

  let archived = 0
  for (const dup of duplicates) {
    const archiveIds = [...new Set(dup.archiveItemIds.filter(id => id !== dup.keepItemId))]
    for (const id of archiveIds) {
      try {
        await archiveCatalogItem(db, id)
        archived += 1
      }
      catch (err) {
        if (err instanceof CatalogServiceError && err.code === 'ALREADY_ARCHIVED') continue
        throw new CatalogAiServiceError('NOT_FOUND', 'Catalog item not found')
      }
    }
  }

  return { updated, archived }
}
