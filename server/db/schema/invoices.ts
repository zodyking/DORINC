import { boolean, date, index, integer, jsonb, numeric, pgSequence, pgTable, text, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core'
import { sql } from 'drizzle-orm'
import type { Address } from './customers'
import { customers } from './customers'
import { serviceLogs } from './service-logs'
import { vehicles } from './vehicles'
import { users } from './auth'
import type { CatalogItemType } from './catalog'
import { appFiles } from './files'
import { invoiceTemplateVersions } from './invoice-templates'
import { pdfRenderJobs } from './pdf-render-jobs'
import { estimates } from './estimates'

/** Invoice lifecycle (SPEC §6.5). Overdue is derived from due_date + sent status. */
export const INVOICE_STATUSES = [
  'draft',
  'pending_manager_approval',
  'approved',
  'sent',
  'paid',
  'void',
] as const
export type InvoiceStatus = (typeof INVOICE_STATUSES)[number]

/** How the invoice was created — direct paths remain first class (SPEC §6.5). */
export const INVOICE_CREATION_SOURCES = [
  'blank',
  'customer',
  'vehicle',
  'service_log',
  'service_request',
  'estimate',
  'duplicate',
  'revision',
] as const
export type InvoiceCreationSource = (typeof INVOICE_CREATION_SOURCES)[number]

import { LINE_ITEM_TYPES, type LineItemType, normalizeLineType } from '#shared/line-item-types'

export const INVOICE_LINE_TYPES = LINE_ITEM_TYPES
export type InvoiceLineType = LineItemType
export { normalizeLineType }

/** Human-facing numbers — displayed as "INV-000092". */
export const invoiceNumberSeq = pgSequence('invoice_number_seq', { startWith: 93 })

/** Frozen catalog row copied when a line is added from the catalog (SPEC §6.3). */
export interface CatalogSnapshot {
  catalogItemId: string
  itemType: CatalogItemType
  sku: string | null
  name: string
  description: string | null
  defaultPrice: string | null
  taxable: boolean
  uom: string
  categoryName: string | null
  capturedAt: string
}

export interface InvoiceCustomerSnapshot {
  displayName: string
  email: string | null
  phone: string | null
  billingAddress: Address | null
  serviceAddress: Address | null
  taxExempt: boolean
  paymentTerms: string
}

export interface InvoiceVehicleSnapshot {
  unitType: string
  busNumber: string | null
  unitTag: string | null
  vin: string | null
  plate: string | null
  year: number | null
  make: string | null
  model: string | null
  odometer: string | null
  odometerUnit: string
}

/** Invoices — server-side totals, revisions not silent overwrites (SPEC §6.5). */
export const invoices = pgTable('invoices', {
  id: uuid('id').primaryKey().defaultRandom(),
  invoiceNumber: integer('invoice_number').notNull().unique().default(sql`nextval('invoice_number_seq')`),

  customerId: uuid('customer_id').references(() => customers.id, { onDelete: 'set null' }),
  vehicleId: uuid('vehicle_id').references(() => vehicles.id, { onDelete: 'set null' }),
  serviceLogId: uuid('service_log_id').references(() => serviceLogs.id, { onDelete: 'set null' }),
  serviceRequestId: uuid('service_request_id'),
  estimateId: uuid('estimate_id').references(() => estimates.id),
  sourceInvoiceId: uuid('source_invoice_id'),

  creationSource: text('creation_source', { enum: INVOICE_CREATION_SOURCES }).notNull().default('blank'),
  status: text('status', { enum: INVOICE_STATUSES }).notNull().default('draft'),

  invoiceDate: date('invoice_date', { mode: 'string' }).notNull(),
  dueDate: date('due_date', { mode: 'string' }),
  paymentTerms: text('payment_terms').notNull().default('due_on_receipt'),

  customerSnapshot: jsonb('customer_snapshot').$type<InvoiceCustomerSnapshot>().notNull(),
  vehicleSnapshot: jsonb('vehicle_snapshot').$type<InvoiceVehicleSnapshot>(),

  serviceLocation: text('service_location'),
  poNumber: text('po_number'),
  complaint: text('complaint'),
  internalNotes: text('internal_notes'),
  customerNotes: text('customer_notes'),

  // Stored totals — always computed server-side (numeric 12,2)
  subtotal: numeric('subtotal', { precision: 12, scale: 2 }).notNull().default('0'),
  taxAmount: numeric('tax_amount', { precision: 12, scale: 2 }).notNull().default('0'),
  discountAmount: numeric('discount_amount', { precision: 12, scale: 2 }).notNull().default('0'),
  feesAmount: numeric('fees_amount', { precision: 12, scale: 2 }).notNull().default('0'),
  total: numeric('total', { precision: 12, scale: 2 }).notNull().default('0'),
  amountPaid: numeric('amount_paid', { precision: 12, scale: 2 }).notNull().default('0'),
  balanceDue: numeric('balance_due', { precision: 12, scale: 2 }).notNull().default('0'),

  // Tax snapshot at time of last totals calculation
  taxExempt: boolean('tax_exempt').notNull().default(false),
  taxRate: numeric('tax_rate', { precision: 8, scale: 6 }).notNull().default('0'),
  // Optional percent-based shop supplies / environmental fee (mockup: 3.5%)
  shopSuppliesPercent: numeric('shop_supplies_percent', { precision: 8, scale: 4 }),

  createdBy: uuid('created_by').references(() => users.id),
  updatedBy: uuid('updated_by').references(() => users.id),
  approvedBy: uuid('approved_by').references(() => users.id),
  approvedAt: timestamp('approved_at', { withTimezone: true }),
  submittedForApprovalAt: timestamp('submitted_for_approval_at', { withTimezone: true }),
  submittedForApprovalBy: uuid('submitted_for_approval_by').references(() => users.id),
  sentAt: timestamp('sent_at', { withTimezone: true }),
  paidAt: timestamp('paid_at', { withTimezone: true }),

  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  archivedAt: timestamp('archived_at', { withTimezone: true }),
}, table => [
  index('invoices_customer_idx').on(table.customerId),
  index('invoices_vehicle_idx').on(table.vehicleId),
  index('invoices_service_log_idx').on(table.serviceLogId),
  index('invoices_status_idx').on(table.status),
  index('invoices_invoice_date_idx').on(table.invoiceDate),
])

/** Line items with catalog snapshots — amounts stored for finalized immutability. */
export const invoiceLineItems = pgTable('invoice_line_items', {
  id: uuid('id').primaryKey().defaultRandom(),
  invoiceId: uuid('invoice_id').notNull().references(() => invoices.id, { onDelete: 'cascade' }),

  lineType: text('line_type', { enum: INVOICE_LINE_TYPES }).notNull(),
  catalogItemId: uuid('catalog_item_id'),
  catalogSnapshot: jsonb('catalog_snapshot').$type<CatalogSnapshot>(),

  description: text('description').notNull(),
  quantity: numeric('quantity', { precision: 12, scale: 2 }).notNull().default('1'),
  unitPrice: numeric('unit_price', { precision: 12, scale: 2 }).notNull().default('0'),
  lineAmount: numeric('line_amount', { precision: 12, scale: 2 }).notNull().default('0'),

  taxable: boolean('taxable').notNull().default(true),
  sortOrder: integer('sort_order').notNull().default(0),

  priceOverridden: boolean('price_overridden').notNull().default(false),
  priceOverrideReason: text('price_override_reason'),

  createdBy: uuid('created_by').references(() => users.id),
  updatedBy: uuid('updated_by').references(() => users.id),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, table => [
  index('invoice_line_items_invoice_idx').on(table.invoiceId),
  index('invoice_line_items_catalog_idx').on(table.catalogItemId),
])

/**
 * Official invoice PDFs — one immutable row per finalized invoice (SPEC §9).
 * Links app_files blob to the template version used at generation time.
 */
export const invoiceFiles = pgTable('invoice_files', {
  id: uuid('id').primaryKey().defaultRandom(),
  invoiceId: uuid('invoice_id').notNull().references(() => invoices.id, { onDelete: 'cascade' }),
  fileId: uuid('file_id').notNull().references(() => appFiles.id),
  templateVersionId: uuid('template_version_id').references(() => invoiceTemplateVersions.id),
  sha256Hash: text('sha256_hash').notNull(),
  pdfRenderJobId: uuid('pdf_render_job_id').references(() => pdfRenderJobs.id),
  createdBy: uuid('created_by').references(() => users.id),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, table => [
  uniqueIndex('invoice_files_invoice_unique').on(table.invoiceId),
  index('invoice_files_file_idx').on(table.fileId),
])

/** Format DB invoice_number as INV-000092. */
export function formatInvoiceNumber(invoiceNumber: number): string {
  return `INV-${String(invoiceNumber).padStart(6, '0')}`
}
