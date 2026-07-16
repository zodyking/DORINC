import { z } from 'zod'
import { LINE_ITEM_TYPES, normalizeLineType } from '#shared/line-item-types'
import { uuidSchema } from './common'

export const serviceLogWorkTypeSchema = z.enum([
  'preventive_maintenance',
  'repair',
  'diagnostic',
  'inspection',
  'other',
])

export const serviceLogStatusSchema = z.enum([
  'draft',
  'uploaded',
  'ocr_processing',
  'ai_processing',
  'ready_for_review',
  'in_review',
  'needs_info',
  'converted_to_invoice',
  'rejected',
  'archived',
])

export const serviceLogDraftLineSchema = z.object({
  lineType: z.preprocess(
    v => v == null || v === '' ? undefined : normalizeLineType(String(v)),
    z.enum(LINE_ITEM_TYPES).optional(),
  ),
  description: z.string().max(500),
  qty: z.string().max(30).nullish(),
  rate: z.string().max(30).nullish(),
  amount: z.string().max(30).nullish(),
})

export const serviceLogCreateSchema = z.object({
  customerId: uuidSchema,
  vehicleId: uuidSchema,
  serviceDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use YYYY-MM-DD'),
  odometerReading: z.string().max(60).nullish(),
  location: z.string().max(200).nullish(),
  workType: serviceLogWorkTypeSchema.optional(),
  complaint: z.string().max(10000).nullish(),
  internalNotes: z.string().max(10000).nullish(),
  draftLineItems: z.array(serviceLogDraftLineSchema).nullish(),
  /** When true, moves the new log straight into ready_for_review after create. */
  finalize: z.boolean().optional(),
})

export const serviceLogUpdateSchema = serviceLogCreateSchema
  .omit({ customerId: true, vehicleId: true })
  .partial()

export const serviceLogStatusChangeSchema = z.object({
  status: serviceLogStatusSchema,
  reason: z.string().max(2000).nullish(),
  invoiceId: uuidSchema.nullish(),
})

export const serviceLogConvertToInvoiceSchema = z.object({
  invoiceDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use YYYY-MM-DD').optional(),
}).default({})

export const serviceLogListQuerySchema = z.object({
  q: z.string().max(200).optional(),
  status: serviceLogStatusSchema.optional(),
  queue: z.enum(['review']).optional(),
  customerId: uuidSchema.optional(),
  vehicleId: uuidSchema.optional(),
  includeArchived: z.coerce.boolean().optional(),
  sort: z.enum(['newest', 'oldest', 'status']).optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(25),
})
