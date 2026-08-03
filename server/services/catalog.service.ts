import { and, asc, count, desc, eq, ilike, inArray, isNull, or } from 'drizzle-orm'
import type { Db } from '../db/client'
import type { CatalogItemType } from '../db/schema/catalog'
import { catalogCategories, catalogItems, catalogLaborRates, catalogPackageItems, catalogPackages } from '../db/schema/catalog'

export type CatalogServiceErrorCode
  = 'NOT_FOUND' | 'ALREADY_ARCHIVED' | 'NOT_ARCHIVED' | 'CATEGORY_NOT_FOUND' | 'INVALID_PACKAGE_ITEM'

export class CatalogServiceError extends Error {
  constructor(public readonly code: CatalogServiceErrorCode) {
    super(code)
  }
}

export interface CatalogCategoryInput {
  name: string
  sortOrder?: number
}

export async function createCategory(db: Db, input: CatalogCategoryInput) {
  const [row] = await db.insert(catalogCategories).values({
    name: input.name.trim(),
    sortOrder: input.sortOrder ?? 0,
  }).returning()
  return row!
}

export async function listCategories(db: Db, includeArchived = false) {
  const rows = await db.select().from(catalogCategories)
    .where(includeArchived ? undefined : isNull(catalogCategories.archivedAt))
    .orderBy(asc(catalogCategories.sortOrder), asc(catalogCategories.name))
  return rows
}

export async function getCategory(db: Db, id: string) {
  const [row] = await db.select().from(catalogCategories).where(eq(catalogCategories.id, id))
  if (!row) throw new CatalogServiceError('NOT_FOUND')
  return row
}

/** Delete a category and unassign catalog items / labor rates (they become uncategorized). */
export async function deleteCategory(db: Db, id: string) {
  const category = await getCategory(db, id)

  await db.update(catalogItems)
    .set({ categoryId: null, updatedAt: new Date() })
    .where(eq(catalogItems.categoryId, id))

  await db.update(catalogLaborRates)
    .set({ categoryId: null, updatedAt: new Date() })
    .where(eq(catalogLaborRates.categoryId, id))

  await db.update(catalogPackages)
    .set({ categoryId: null, updatedAt: new Date() })
    .where(eq(catalogPackages.categoryId, id))

  await db.delete(catalogCategories).where(eq(catalogCategories.id, id))

  return category
}

export interface CatalogItemInput {
  itemType: CatalogItemType
  sku?: string | null
  name: string
  description?: string | null
  categoryId?: string | null
  defaultPrice?: string | null
  cost?: string | null
  markupPercent?: string | null
  taxable?: boolean
  uom?: string
  vendor?: string | null
}

export async function createCatalogItem(db: Db, input: CatalogItemInput, createdBy: string) {
  if (input.categoryId) await getCategory(db, input.categoryId)

  const [row] = await db.insert(catalogItems).values({
    itemType: input.itemType,
    sku: input.sku ?? null,
    name: input.name.trim(),
    description: input.description ?? null,
    categoryId: input.categoryId ?? null,
    defaultPrice: input.defaultPrice ?? null,
    cost: input.cost ?? null,
    markupPercent: input.markupPercent ?? null,
    taxable: input.taxable ?? true,
    uom: input.uom ?? 'each',
    vendor: input.vendor ?? null,
    createdBy,
  }).returning()
  return row!
}

export async function getCatalogItem(db: Db, id: string) {
  const [row] = await db.select({
    item: catalogItems,
    categoryName: catalogCategories.name,
  })
    .from(catalogItems)
    .leftJoin(catalogCategories, eq(catalogItems.categoryId, catalogCategories.id))
    .where(eq(catalogItems.id, id))
  if (!row) throw new CatalogServiceError('NOT_FOUND')
  return { ...row.item, categoryName: row.categoryName }
}

export interface ListCatalogItemsFilter {
  q?: string
  itemType?: CatalogItemType
  categoryId?: string
  taxable?: boolean
  includeArchived?: boolean
  sort?: 'name-asc' | 'name-desc' | 'sku-asc' | 'newest'
  page: number
  pageSize: number
}

export async function listCatalogItems(db: Db, filter: ListCatalogItemsFilter) {
  const conditions = []
  if (!filter.includeArchived) conditions.push(isNull(catalogItems.archivedAt))
  if (filter.itemType) conditions.push(eq(catalogItems.itemType, filter.itemType))
  if (filter.categoryId) conditions.push(eq(catalogItems.categoryId, filter.categoryId))
  if (filter.taxable !== undefined) conditions.push(eq(catalogItems.taxable, filter.taxable))

  if (filter.q) {
    const words = filter.q.trim().split(/\s+/).filter(Boolean)
    for (const word of words) {
      const term = `%${word}%`
      conditions.push(or(
        ilike(catalogItems.name, term),
        ilike(catalogItems.sku, term),
        ilike(catalogItems.description, term),
        ilike(catalogCategories.name, term),
      ))
    }
  }

  const where = conditions.length ? and(...conditions) : undefined
  const orderBy = filter.sort === 'name-desc'
    ? desc(catalogItems.name)
    : filter.sort === 'sku-asc'
      ? asc(catalogItems.sku)
      : filter.sort === 'newest'
        ? desc(catalogItems.createdAt)
        : asc(catalogItems.name)

  const rows = await db.select({
    item: catalogItems,
    categoryName: catalogCategories.name,
  })
    .from(catalogItems)
    .leftJoin(catalogCategories, eq(catalogItems.categoryId, catalogCategories.id))
    .where(where)
    .orderBy(orderBy)
    .limit(filter.pageSize)
    .offset((filter.page - 1) * filter.pageSize)

  const [total] = await db.select({ value: count() })
    .from(catalogItems)
    .leftJoin(catalogCategories, eq(catalogItems.categoryId, catalogCategories.id))
    .where(where)

  return {
    items: rows.map(r => ({ ...r.item, categoryName: r.categoryName })),
    total: Number(total!.value),
    page: filter.page,
    pageSize: filter.pageSize,
  }
}

export async function updateCatalogItem(db: Db, id: string, patch: Partial<CatalogItemInput>) {
  const before = await getCatalogItem(db, id)
  if (patch.categoryId) await getCategory(db, patch.categoryId)

  const changes: Record<string, unknown> = { updatedAt: new Date() }
  const changedFields: string[] = []
  for (const [key, value] of Object.entries(patch)) {
    if (value !== undefined && JSON.stringify(value) !== JSON.stringify(before[key as keyof typeof before])) {
      changes[key] = value
      changedFields.push(key)
    }
  }
  if (!changedFields.length) return { item: before, before, changedFields }

  const [updated] = await db.update(catalogItems).set(changes).where(eq(catalogItems.id, id)).returning()
  return { item: updated!, before, changedFields }
}

export async function archiveCatalogItem(db: Db, id: string) {
  const before = await getCatalogItem(db, id)
  if (before.archivedAt) throw new CatalogServiceError('ALREADY_ARCHIVED')
  const [row] = await db.update(catalogItems)
    .set({ archivedAt: new Date(), updatedAt: new Date() })
    .where(eq(catalogItems.id, id))
    .returning()
  return row!
}

export interface LaborRateInput {
  catalogItemId?: string | null
  name: string
  sku?: string | null
  description?: string | null
  categoryId?: string | null
  rate: string
  uom?: string
  taxable?: boolean
}

export async function createLaborRate(db: Db, input: LaborRateInput, createdBy: string) {
  if (input.categoryId) await getCategory(db, input.categoryId)
  if (input.catalogItemId) await getCatalogItem(db, input.catalogItemId)

  const [row] = await db.insert(catalogLaborRates).values({
    catalogItemId: input.catalogItemId ?? null,
    name: input.name.trim(),
    sku: input.sku ?? null,
    description: input.description ?? null,
    categoryId: input.categoryId ?? null,
    rate: input.rate,
    uom: input.uom ?? 'hr',
    taxable: input.taxable ?? true,
    createdBy,
  }).returning()
  return row!
}

export async function listLaborRates(db: Db, filter: { q?: string, includeArchived?: boolean, page: number, pageSize: number }) {
  const conditions = []
  if (!filter.includeArchived) conditions.push(isNull(catalogLaborRates.archivedAt))
  if (filter.q) {
    const term = `%${filter.q}%`
    conditions.push(or(
      ilike(catalogLaborRates.name, term),
      ilike(catalogLaborRates.sku, term),
      ilike(catalogLaborRates.description, term),
    ))
  }
  const where = conditions.length ? and(...conditions) : undefined

  const rows = await db.select().from(catalogLaborRates)
    .where(where)
    .orderBy(asc(catalogLaborRates.name))
    .limit(filter.pageSize)
    .offset((filter.page - 1) * filter.pageSize)

  const [total] = await db.select({ value: count() }).from(catalogLaborRates).where(where)
  return { items: rows, total: Number(total!.value), page: filter.page, pageSize: filter.pageSize }
}

export async function archiveLaborRate(db: Db, id: string) {
  const [before] = await db.select().from(catalogLaborRates).where(eq(catalogLaborRates.id, id))
  if (!before) throw new CatalogServiceError('NOT_FOUND')
  if (before.archivedAt) throw new CatalogServiceError('ALREADY_ARCHIVED')
  const [row] = await db.update(catalogLaborRates)
    .set({ archivedAt: new Date(), updatedAt: new Date() })
    .where(eq(catalogLaborRates.id, id))
    .returning()
  return row!
}

export interface CatalogPackageInput {
  sku?: string | null
  name: string
  description?: string | null
  categoryId?: string | null
}

export interface CatalogPackageItemInput {
  catalogItemId: string
  quantity: string
  sortOrder?: number
}

async function validatePackageCatalogItem(db: Db, catalogItemId: string) {
  const item = await getCatalogItem(db, catalogItemId)
  if (item.archivedAt) throw new CatalogServiceError('INVALID_PACKAGE_ITEM')
  return item
}

export async function createPackage(
  db: Db,
  input: CatalogPackageInput,
  createdBy: string,
  items: CatalogPackageItemInput[] = [],
) {
  if (input.categoryId) await getCategory(db, input.categoryId)
  for (const line of items) await validatePackageCatalogItem(db, line.catalogItemId)

  const [pkg] = await db.insert(catalogPackages).values({
    sku: input.sku ?? null,
    name: input.name.trim(),
    description: input.description ?? null,
    categoryId: input.categoryId ?? null,
    createdBy,
  }).returning()

  if (items.length) {
    await db.insert(catalogPackageItems).values(items.map((line, index) => ({
      packageId: pkg!.id,
      catalogItemId: line.catalogItemId,
      quantity: line.quantity,
      sortOrder: line.sortOrder ?? index,
    })))
  }

  return getPackage(db, pkg!.id)
}

export async function getPackage(db: Db, id: string) {
  const [row] = await db.select({
    pkg: catalogPackages,
    categoryName: catalogCategories.name,
  })
    .from(catalogPackages)
    .leftJoin(catalogCategories, eq(catalogPackages.categoryId, catalogCategories.id))
    .where(eq(catalogPackages.id, id))
  if (!row) throw new CatalogServiceError('NOT_FOUND')

  const itemRows = await db.select({
    line: catalogPackageItems,
    item: catalogItems,
  })
    .from(catalogPackageItems)
    .innerJoin(catalogItems, eq(catalogPackageItems.catalogItemId, catalogItems.id))
    .where(eq(catalogPackageItems.packageId, id))
    .orderBy(asc(catalogPackageItems.sortOrder), asc(catalogPackageItems.createdAt))

  return {
    ...row.pkg,
    categoryName: row.categoryName,
    items: itemRows.map(r => ({
      id: r.line.id,
      catalogItemId: r.line.catalogItemId,
      quantity: r.line.quantity,
      sortOrder: r.line.sortOrder,
      itemType: r.item.itemType,
      sku: r.item.sku,
      name: r.item.name,
      defaultPrice: r.item.defaultPrice,
      uom: r.item.uom,
    })),
  }
}

export interface ListCatalogPackagesFilter {
  q?: string
  categoryId?: string
  includeArchived?: boolean
  sort?: 'name-asc' | 'name-desc' | 'sku-asc' | 'newest'
  page: number
  pageSize: number
}

export async function listPackages(db: Db, filter: ListCatalogPackagesFilter) {
  const conditions = []
  if (!filter.includeArchived) conditions.push(isNull(catalogPackages.archivedAt))
  if (filter.categoryId) conditions.push(eq(catalogPackages.categoryId, filter.categoryId))

  if (filter.q) {
    const words = filter.q.trim().split(/\s+/).filter(Boolean)
    for (const word of words) {
      const term = `%${word}%`
      conditions.push(or(
        ilike(catalogPackages.name, term),
        ilike(catalogPackages.sku, term),
        ilike(catalogPackages.description, term),
        ilike(catalogCategories.name, term),
      ))
    }
  }

  const where = conditions.length ? and(...conditions) : undefined
  const orderBy = filter.sort === 'name-desc'
    ? desc(catalogPackages.name)
    : filter.sort === 'sku-asc'
      ? asc(catalogPackages.sku)
      : filter.sort === 'newest'
        ? desc(catalogPackages.createdAt)
        : asc(catalogPackages.name)

  const rows = await db.select({
    pkg: catalogPackages,
    categoryName: catalogCategories.name,
  })
    .from(catalogPackages)
    .leftJoin(catalogCategories, eq(catalogPackages.categoryId, catalogCategories.id))
    .where(where)
    .orderBy(orderBy)
    .limit(filter.pageSize)
    .offset((filter.page - 1) * filter.pageSize)

  const [total] = await db.select({ value: count() })
    .from(catalogPackages)
    .leftJoin(catalogCategories, eq(catalogPackages.categoryId, catalogCategories.id))
    .where(where)

  const packageIds = rows.map(r => r.pkg.id)
  const itemCounts = new Map<string, number>()
  if (packageIds.length) {
    const counts = await db.select({
      packageId: catalogPackageItems.packageId,
      value: count(),
    })
      .from(catalogPackageItems)
      .where(inArray(catalogPackageItems.packageId, packageIds))
      .groupBy(catalogPackageItems.packageId)
    for (const row of counts) itemCounts.set(row.packageId, Number(row.value))
  }

  return {
    items: rows.map(r => ({
      ...r.pkg,
      categoryName: r.categoryName,
      itemCount: itemCounts.get(r.pkg.id) ?? 0,
    })),
    total: Number(total!.value),
    page: filter.page,
    pageSize: filter.pageSize,
  }
}

export async function updatePackage(db: Db, id: string, patch: Partial<CatalogPackageInput>) {
  const before = await getPackage(db, id)
  if (patch.categoryId) await getCategory(db, patch.categoryId)

  const changes: Record<string, unknown> = { updatedAt: new Date() }
  const changedFields: string[] = []
  for (const [key, value] of Object.entries(patch)) {
    if (value !== undefined && JSON.stringify(value) !== JSON.stringify(before[key as keyof typeof before])) {
      changes[key] = value
      changedFields.push(key)
    }
  }
  if (!changedFields.length) return { pkg: before, before, changedFields }

  await db.update(catalogPackages).set(changes).where(eq(catalogPackages.id, id))
  const pkg = await getPackage(db, id)
  return { pkg, before, changedFields }
}

export async function archivePackage(db: Db, id: string) {
  const before = await getPackage(db, id)
  if (before.archivedAt) throw new CatalogServiceError('ALREADY_ARCHIVED')
  const [row] = await db.update(catalogPackages)
    .set({ archivedAt: new Date(), updatedAt: new Date() })
    .where(eq(catalogPackages.id, id))
    .returning()
  return row!
}

export async function setPackageItems(db: Db, packageId: string, items: CatalogPackageItemInput[]) {
  await getPackage(db, packageId)
  for (const line of items) await validatePackageCatalogItem(db, line.catalogItemId)

  await db.delete(catalogPackageItems).where(eq(catalogPackageItems.packageId, packageId))
  if (items.length) {
    await db.insert(catalogPackageItems).values(items.map((line, index) => ({
      packageId,
      catalogItemId: line.catalogItemId,
      quantity: line.quantity,
      sortOrder: line.sortOrder ?? index,
    })))
  }

  return getPackage(db, packageId)
}
