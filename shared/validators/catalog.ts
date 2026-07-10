import { z } from 'zod'
import { uuidSchema } from './common'

export const catalogItemTypeSchema = z.enum(['part', 'service', 'fee'])

export const catalogCategoryCreateSchema = z.object({
  name: z.string().trim().min(1).max(120),
  sortOrder: z.number().int().min(0).max(9999).optional(),
})

export const catalogCategoryUpdateSchema = catalogCategoryCreateSchema.partial()

export const catalogItemCreateSchema = z.object({
  itemType: catalogItemTypeSchema,
  sku: z.string().trim().max(40).nullish(),
  name: z.string().trim().min(1).max(200),
  description: z.string().max(2000).nullish(),
  categoryId: uuidSchema.nullish(),
  defaultPrice: z.string().trim().max(30).nullish(),
  cost: z.string().trim().max(30).nullish(),
  markupPercent: z.string().trim().max(30).nullish(),
  taxable: z.boolean().optional(),
  uom: z.string().trim().max(30).optional(),
  vendor: z.string().trim().max(120).nullish(),
})

export const catalogItemUpdateSchema = catalogItemCreateSchema.partial().omit({ itemType: true }).extend({
  itemType: catalogItemTypeSchema.optional(),
})

export const catalogItemListQuerySchema = z.object({
  q: z.string().max(200).optional(),
  itemType: catalogItemTypeSchema.optional(),
  categoryId: uuidSchema.optional(),
  taxable: z.coerce.boolean().optional(),
  includeArchived: z.coerce.boolean().optional(),
  sort: z.enum(['name-asc', 'name-desc', 'sku-asc', 'newest']).optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(25),
})

export const catalogLaborRateCreateSchema = z.object({
  catalogItemId: uuidSchema.nullish(),
  name: z.string().trim().min(1).max(200),
  sku: z.string().trim().max(40).nullish(),
  description: z.string().max(2000).nullish(),
  categoryId: uuidSchema.nullish(),
  rate: z.string().trim().min(1).max(30),
  uom: z.string().trim().max(30).optional(),
  taxable: z.boolean().optional(),
})

export const catalogLaborRateUpdateSchema = catalogLaborRateCreateSchema.partial()

export const catalogLaborRateListQuerySchema = z.object({
  q: z.string().max(200).optional(),
  includeArchived: z.coerce.boolean().optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(25),
})
