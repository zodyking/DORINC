import { boolean, date, index, integer, jsonb, numeric, pgSequence, pgTable, text, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core'
import { sql } from 'drizzle-orm'
import { customers } from './customers'
import { serviceLogs } from './service-logs'
import { vehicles } from './vehicles'
import { users } from './auth'
import { invoices } from './invoices'
import type { CatalogSnapshot, InvoiceCustomerSnapshot, InvoiceVehicleSnapshot } from './invoices'
import { appFiles } from './files'
import { invoiceTemplateVersions } from './invoice-templates'
import { pdfRenderJobs } from './pdf-render-jobs'

/** Estimate lifecycle — customer approves/rejects in portal (SPEC §6.6). */
export const ESTIMATE_STATUSES = [
  'draft',
  'sent',
  'approved',
  'rejected',
  'converted',
  'expired',
  'void',
] as const
export type EstimateStatus = (typeof ESTIMATE_STATUSES)[number]

export const ESTIMATE_CREATION_SOURCES = [
  'blank',
  'customer',
  'vehicle',
  'service_log',
  'service_request',
] as const
export type EstimateCreationSource = (typeof ESTIMATE_CREATION_SOURCES)[number]

import { LINE_ITEM_TYPES, type LineItemType } from '#shared/line-item-types'

export const ESTIMATE_LINE_TYPES = LINE_ITEM_TYPES
export type EstimateLineType = LineItemType

export const estimateNumberSeq = pgSequence('estimate_number_seq', { startWith: 1 })

export type EstimateCustomerSnapshot = InvoiceCustomerSnapshot
export type EstimateVehicleSnapshot = InvoiceVehicleSnapshot

/** Estimates — optional pre-invoice quotes with portal approval (SPEC §6.6). */
export const estimates = pgTable('estimates', {
  id: uuid('id').primaryKey().defaultRandom(),
  estimateNumber: integer('estimate_number').notNull().unique().default(sql`nextval('estimate_number_seq')`),

  customerId: uuid('customer_id').references(() => customers.id, { onDelete: 'set null' }),
  vehicleId: uuid('vehicle_id').references(() => vehicles.id, { onDelete: 'set null' }),
  serviceLogId: uuid('service_log_id').references(() => serviceLogs.id, { onDelete: 'set null' }),
  serviceRequestId: uuid('service_request_id'),

  creationSource: text('creation_source', { enum: ESTIMATE_CREATION_SOURCES }).notNull().default('blank'),
  status: text('status', { enum: ESTIMATE_STATUSES }).notNull().default('draft'),

  estimateDate: date('estimate_date', { mode: 'string' }).notNull(),
  validUntil: date('valid_until', { mode: 'string' }),

  customerSnapshot: jsonb('customer_snapshot').$type<EstimateCustomerSnapshot>().notNull(),
  vehicleSnapshot: jsonb('vehicle_snapshot').$type<EstimateVehicleSnapshot>(),

  serviceLocation: text('service_location'),
  poNumber: text('po_number'),
  complaint: text('complaint'),
  internalNotes: text('internal_notes'),
  customerNotes: text('customer_notes'),

  subtotal: numeric('subtotal', { precision: 12, scale: 2 }).notNull().default('0'),
  taxAmount: numeric('tax_amount', { precision: 12, scale: 2 }).notNull().default('0'),
  discountAmount: numeric('discount_amount', { precision: 12, scale: 2 }).notNull().default('0'),
  feesAmount: numeric('fees_amount', { precision: 12, scale: 2 }).notNull().default('0'),
  total: numeric('total', { precision: 12, scale: 2 }).notNull().default('0'),

  taxExempt: boolean('tax_exempt').notNull().default(false),
  taxRate: numeric('tax_rate', { precision: 8, scale: 6 }).notNull().default('0'),
  shopSuppliesPercent: numeric('shop_supplies_percent', { precision: 8, scale: 4 }),

  createdBy: uuid('created_by').references(() => users.id),
  updatedBy: uuid('updated_by').references(() => users.id),
  approvedBy: uuid('approved_by').references(() => users.id),
  approvedAt: timestamp('approved_at', { withTimezone: true }),
  sentAt: timestamp('sent_at', { withTimezone: true }),
  sentBy: uuid('sent_by').references(() => users.id),

  customerApprovedAt: timestamp('customer_approved_at', { withTimezone: true }),
  customerApprovedBy: uuid('customer_approved_by').references(() => users.id),
  customerRejectedAt: timestamp('customer_rejected_at', { withTimezone: true }),
  customerRejectedBy: uuid('customer_rejected_by').references(() => users.id),
  customerResponseNotes: text('customer_response_notes'),

  convertedInvoiceId: uuid('converted_invoice_id').references(() => invoices.id),
  convertedAt: timestamp('converted_at', { withTimezone: true }),
  convertedBy: uuid('converted_by').references(() => users.id),

  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  archivedAt: timestamp('archived_at', { withTimezone: true }),
}, table => [
  index('estimates_customer_idx').on(table.customerId),
  index('estimates_vehicle_idx').on(table.vehicleId),
  index('estimates_status_idx').on(table.status),
  index('estimates_estimate_date_idx').on(table.estimateDate),
])

export const estimateLineItems = pgTable('estimate_line_items', {
  id: uuid('id').primaryKey().defaultRandom(),
  estimateId: uuid('estimate_id').notNull().references(() => estimates.id, { onDelete: 'cascade' }),

  lineType: text('line_type', { enum: ESTIMATE_LINE_TYPES }).notNull(),
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
  index('estimate_line_items_estimate_idx').on(table.estimateId),
])

/** Official estimate PDFs — one immutable row per sent/approved estimate (SPEC §9). */
export const estimateFiles = pgTable('estimate_files', {
  id: uuid('id').primaryKey().defaultRandom(),
  estimateId: uuid('estimate_id').notNull().references(() => estimates.id, { onDelete: 'cascade' }),
  fileId: uuid('file_id').notNull().references(() => appFiles.id),
  templateVersionId: uuid('template_version_id').references(() => invoiceTemplateVersions.id),
  sha256Hash: text('sha256_hash').notNull(),
  pdfRenderJobId: uuid('pdf_render_job_id').references(() => pdfRenderJobs.id),
  createdBy: uuid('created_by').references(() => users.id),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, table => [
  uniqueIndex('estimate_files_estimate_unique').on(table.estimateId),
  index('estimate_files_file_idx').on(table.fileId),
])

export function formatEstimateNumber(estimateNumber: number): string {
  return `EST-${String(estimateNumber).padStart(6, '0')}`
}
