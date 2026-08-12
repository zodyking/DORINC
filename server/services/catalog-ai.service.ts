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
}> {
  const minOccurrences = Math.max(1, opts.minOccurrences ?? 2)
  const limit = Math.min(100, Math.max(1, opts.limit ?? 50))
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

  const candidates = buildCommonlyBilledCandidates(
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
