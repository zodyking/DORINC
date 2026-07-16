import { z } from 'zod'
import { LINE_ITEM_TYPES } from '#shared/line-item-types'
import { moneySchema, paginationSchema, uuidSchema } from './common'

export const invoiceStatusSchema = z.enum(['draft', 'pending_manager_approval', 'sent', 'paid', 'void'])

export const invoiceCreationSourceSchema = z.enum([
  'blank',
  'customer',
  'vehicle',
  'service_log',
  'service_request',
  'estimate',
  'duplicate',
  'revision',
])

export const invoiceLineTypeSchema = z.enum(LINE_ITEM_TYPES)

export const paymentTermsSchema = z.enum(['due_on_receipt', 'net_15', 'net_30', 'net_45', 'net_60'])

const invoiceHeaderFields = {
  invoiceDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use YYYY-MM-DD'),
  dueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use YYYY-MM-DD').nullish(),
  paymentTerms: paymentTermsSchema.optional(),
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

export const invoiceCreateSchema = z.object({
  creationSource: invoiceCreationSourceSchema.default('blank'),
  customerId: uuidSchema.optional(),
  vehicleId: uuidSchema.nullish(),
  serviceLogId: uuidSchema.nullish(),
  ...invoiceHeaderFields,
})

export const invoiceUpdateSchema = z.object({
  customerId: uuidSchema.optional(),
  vehicleId: uuidSchema.nullish(),
  ...invoiceHeaderFields,
}).partial()

export const invoiceDatesSchema = z.object({
  invoiceDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use YYYY-MM-DD'),
  dueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use YYYY-MM-DD').nullable(),
  reason: z.string().trim().max(500).optional(),
}).refine(v => !v.dueDate || v.dueDate >= v.invoiceDate, {
  message: 'Due date cannot be before the invoice date',
  path: ['dueDate'],
})

export type InvoiceDatesInput = z.infer<typeof invoiceDatesSchema>

export const invoiceSendSchema = z.object({
  recipientEmail: z.string().trim().email('Enter a valid email').max(200).optional(),
  subject: z.string().trim().min(1).max(300).optional(),
  message: z.string().trim().max(5000).optional(),
})

export const invoiceBulkSendSchema = z.object({
  customerId: uuidSchema,
  invoiceIds: z.array(uuidSchema).min(1, 'Select at least one invoice').max(100),
  subject: z.string().trim().min(1).max(300).optional(),
  message: z.string().trim().max(5000).optional(),
})

export type InvoiceSendInput = z.infer<typeof invoiceSendSchema>
export type InvoiceBulkSendInput = z.infer<typeof invoiceBulkSendSchema>

export const invoiceLineCreateSchema = z.object({
  lineType: invoiceLineTypeSchema,
  catalogItemId: uuidSchema.nullish(),
  description: z.string().trim().min(1).max(500),
  quantity: moneySchema,
  unitPrice: moneySchema,
  taxable: z.boolean().optional(),
  sortOrder: z.number().int().min(0).optional(),
  priceOverridden: z.boolean().optional(),
  priceOverrideReason: z.string().max(500).nullish(),
})

export const invoiceLineUpdateSchema = invoiceLineCreateSchema
  .omit({ lineType: true })
  .extend({ lineType: invoiceLineTypeSchema.optional() })
  .partial()

export const invoicePaymentMethodSchema = z.enum(['ach', 'check', 'cash', 'credit_card', 'wire'])

export const invoiceMarkPaidSchema = z.object({
  /** Incremental payment for this transaction (preferred). */
  paymentAmount: moneySchema.optional(),
  /** Legacy total cumulative amount_paid. */
  amountPaid: moneySchema.optional(),
  paidAt: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use YYYY-MM-DD').nullish(),
  method: invoicePaymentMethodSchema.optional(),
  reference: z.string().max(100).nullish(),
  notes: z.string().max(2000).nullish(),
})

export const invoiceListQuerySchema = paginationSchema.extend({
  q: z.string().max(200).optional(),
  status: invoiceStatusSchema.optional(),
  overdue: z.coerce.boolean().optional(),
  customerId: uuidSchema.optional(),
  vehicleId: uuidSchema.optional(),
  includeArchived: z.coerce.boolean().optional(),
  sort: z.enum(['newest', 'oldest', 'invoice_date', 'status']).optional(),
})

export const invoiceExportQuerySchema = invoiceListQuerySchema.omit({ page: true, pageSize: true })

export const invoiceLineParamSchema = z.object({
  id: uuidSchema,
  lineId: uuidSchema,
})
