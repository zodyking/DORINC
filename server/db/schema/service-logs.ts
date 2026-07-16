import { date, index, integer, jsonb, pgSequence, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core'
import { sql } from 'drizzle-orm'
import { customers } from './customers'
import { vehicles } from './vehicles'
import { users } from './auth'
import type { InvoiceCustomerSnapshot, InvoiceVehicleSnapshot } from './invoices'

/** Lifecycle statuses (SPEC §6.4). OCR/AI states are reserved for Phase 2 workers. */
export const SERVICE_LOG_STATUSES = [
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
] as const
export type ServiceLogStatus = (typeof SERVICE_LOG_STATUSES)[number]

export const SERVICE_LOG_WORK_TYPES = [
  'preventive_maintenance',
  'repair',
  'diagnostic',
  'inspection',
  'other',
] as const
export type ServiceLogWorkType = (typeof SERVICE_LOG_WORK_TYPES)[number]

/** Human-facing log numbers — displayed as "SL-1042". */
export const serviceLogNumberSeq = pgSequence('service_log_number_seq', { startWith: 1001 })

/** Field service logs uploaded by mechanics, reviewed into invoices (SPEC §6.4). */
export const serviceLogs = pgTable('service_logs', {
  id: uuid('id').primaryKey().defaultRandom(),
  logNumber: integer('log_number').notNull().unique().default(sql`nextval('service_log_number_seq')`),

  /** Nullable after hard-delete of customer — display uses customerSnapshot. */
  customerId: uuid('customer_id').references(() => customers.id, { onDelete: 'set null' }),
  /** Nullable after hard-delete of vehicle — display uses vehicleSnapshot. */
  vehicleId: uuid('vehicle_id').references(() => vehicles.id, { onDelete: 'set null' }),
  submittedBy: uuid('submitted_by').notNull().references(() => users.id),

  serviceDate: date('service_date', { mode: 'string' }).notNull(),
  // Free-text meter reading as captured in the field (e.g. "412,806 mi")
  odometerReading: text('odometer_reading'),
  location: text('location'),

  workType: text('work_type', { enum: SERVICE_LOG_WORK_TYPES }).notNull().default('repair'),
  // Flows to the invoice PDF under Symptoms / Complaints
  complaint: text('complaint'),
  // Staff only — never shown on customer PDF or portal
  internalNotes: text('internal_notes'),

  status: text('status', { enum: SERVICE_LOG_STATUSES }).notNull().default('draft'),
  /** True when the log was opened from a portal customer service request. */
  customerRequested: boolean('customer_requested').notNull().default(false),
  // Reviewer note attached to needs_info / rejected transitions
  statusReason: text('status_reason'),

  // Draft invoice lines (Phase 2 AI extraction lands here; reviewers may edit)
  draftLineItems: jsonb('draft_line_items'),
  // Set when converted to an invoice — FK enforced in migration 0010
  invoiceId: uuid('invoice_id'),

  /** Frozen customer/vehicle info so hard-deletes do not erase history. */
  customerSnapshot: jsonb('customer_snapshot').$type<InvoiceCustomerSnapshot>(),
  vehicleSnapshot: jsonb('vehicle_snapshot').$type<InvoiceVehicleSnapshot>(),

  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  archivedAt: timestamp('archived_at', { withTimezone: true }),
}, table => [
  index('service_logs_customer_idx').on(table.customerId),
  index('service_logs_vehicle_idx').on(table.vehicleId),
  index('service_logs_submitted_by_idx').on(table.submittedBy),
  index('service_logs_status_idx').on(table.status),
])
