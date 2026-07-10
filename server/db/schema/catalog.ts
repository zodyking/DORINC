import { boolean, index, integer, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core'
import { users } from './auth'

export const CATALOG_ITEM_TYPES = ['part', 'labor', 'fee'] as const
export type CatalogItemType = (typeof CATALOG_ITEM_TYPES)[number]

/** Grouping for catalog items (mockup: Aftertreatment, Fluids, Labor rates, …). */
export const catalogCategories = pgTable('catalog_categories', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: text('name').notNull(),
  sortOrder: integer('sort_order').notNull().default(0),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  archivedAt: timestamp('archived_at', { withTimezone: true }),
}, table => [
  index('catalog_categories_name_idx').on(table.name),
])

/** Parts, labor, and fees (SPEC §6.3). */
export const catalogItems = pgTable('catalog_items', {
  id: uuid('id').primaryKey().defaultRandom(),

  itemType: text('item_type', { enum: CATALOG_ITEM_TYPES }).notNull(),
  sku: text('sku'),
  name: text('name').notNull(),
  description: text('description'),

  categoryId: uuid('category_id').references(() => catalogCategories.id),

  // Decimal strings — invoice math stays server-side (P1-20+)
  defaultPrice: text('default_price'),
  cost: text('cost'),
  markupPercent: text('markup_percent'),

  taxable: boolean('taxable').notNull().default(true),
  uom: text('uom').notNull().default('each'),
  vendor: text('vendor'),

  createdBy: uuid('created_by').references(() => users.id),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  archivedAt: timestamp('archived_at', { withTimezone: true }),
}, table => [
  index('catalog_items_type_idx').on(table.itemType),
  index('catalog_items_category_idx').on(table.categoryId),
  index('catalog_items_name_idx').on(table.name),
  index('catalog_items_sku_idx').on(table.sku),
])

/** Standard shop labor rates — linked to labor catalog items when applicable (SPEC §6.3). */
export const catalogLaborRates = pgTable('catalog_labor_rates', {
  id: uuid('id').primaryKey().defaultRandom(),
  catalogItemId: uuid('catalog_item_id').references(() => catalogItems.id),

  name: text('name').notNull(),
  sku: text('sku'),
  description: text('description'),
  categoryId: uuid('category_id').references(() => catalogCategories.id),

  rate: text('rate').notNull(),
  uom: text('uom').notNull().default('hr'),
  taxable: boolean('taxable').notNull().default(true),

  createdBy: uuid('created_by').references(() => users.id),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  archivedAt: timestamp('archived_at', { withTimezone: true }),
}, table => [
  index('catalog_labor_rates_item_idx').on(table.catalogItemId),
])
