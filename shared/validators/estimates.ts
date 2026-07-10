import { z } from 'zod'
import { LINE_ITEM_TYPES, normalizeLineType } from '#shared/line-item-types'
import { moneySchema, paginationSchema, uuidSchema } from './common'
import { ESTIMATE_STATUSES } from '../../server/db/schema/estimates'

export const estimateStatusSchema = z.enum(ESTIMATE_STATUSES)

export const estimateCreationSourceSchema = z.enum([
  'blank',
  'customer',
  'vehicle',
  'service_log',
  'service_request',
])

const estimateHeaderFields = {
  estimateDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use YYYY-MM-DD'),
  validUntil: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use YYYY-MM-DD').nullish(),
  serviceLocation: z.string().max(200).nullish(),
  poNumber: z.string().max(100).nullish(),
  complaint: z.string().max(10000).nullish(),
  internalNotes: z.string().max(10000).nullish(),
  customerNotes: z.string().max(10000).nullish(),
  taxRate: z.string().max(20).optional(),
  shopSuppliesPercent: z.string().max(20).nullish(),
  feesAmount: moneySchema.optional(),
  discountAmount: moneySchema.optional(),
}

export const estimateCreateSchema = z.object({
  creationSource: estimateCreationSourceSchema.default('blank'),
  customerId: uuidSchema.optional(),
  vehicleId: uuidSchema.nullish(),
  serviceLogId: uuidSchema.nullish(),
  serviceRequestId: uuidSchema.nullish(),
  ...estimateHeaderFields,
})

export const estimateUpdateSchema = z.object({
  vehicleId: uuidSchema.nullish(),
  ...estimateHeaderFields,
}).partial()

export const estimateAddLineSchema = z.object({
  lineType: z.preprocess(v => normalizeLineType(String(v)), z.enum(LINE_ITEM_TYPES)),
  catalogItemId: uuidSchema.nullish(),
  description: z.string().trim().min(1).max(500),
  quantity: moneySchema,
  unitPrice: moneySchema,
  taxable: z.boolean().optional(),
  sortOrder: z.number().int().min(0).optional(),
})

export const estimateLineUpdateSchema = estimateAddLineSchema
  .omit({ lineType: true })
  .extend({
    lineType: z.preprocess(
      v => (v == null || v === '' ? undefined : normalizeLineType(String(v))),
      z.enum(LINE_ITEM_TYPES).optional(),
    ),
  })
  .partial()

export const estimateListQuerySchema = paginationSchema.extend({
  q: z.string().max(200).optional(),
  status: estimateStatusSchema.optional(),
  customerId: uuidSchema.optional(),
  vehicleId: uuidSchema.optional(),
  includeArchived: z.coerce.boolean().optional(),
  sort: z.enum(['newest', 'oldest', 'estimate_date', 'status']).optional(),
})

export const estimateLineParamSchema = z.object({
  id: uuidSchema,
  lineId: uuidSchema,
})

export const estimatePortalResponseSchema = z.object({
  notes: z.string().max(2000).trim().optional().nullable(),
})

export const estimateConvertToInvoiceSchema = z.object({
  invoiceDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
})
