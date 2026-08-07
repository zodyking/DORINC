import { index, pgTable, text, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core'

export const SERVICE_LOG_UPLOAD_SESSION_STATUSES = [
  'pending',
  'uploading',
  'completed',
  'expired',
  'cancelled',
] as const

export type ServiceLogUploadSessionStatus = (typeof SERVICE_LOG_UPLOAD_SESSION_STATUSES)[number]

/**
 * Short-lived QR / phone upload bridge for attaching service-log photos
 * to an invoice draft without requiring a second login on the phone.
 */
export const serviceLogUploadSessions = pgTable('service_log_upload_sessions', {
  id: uuid('id').primaryKey().defaultRandom(),
  tokenHash: text('token_hash').notNull(),
  createdBy: uuid('created_by').notNull(),
  technicianId: uuid('technician_id').notNull(),
  customerId: uuid('customer_id').notNull(),
  vehicleId: uuid('vehicle_id').notNull(),
  invoiceId: uuid('invoice_id'),
  serviceLogId: uuid('service_log_id'),
  status: text('status', { enum: SERVICE_LOG_UPLOAD_SESSION_STATUSES }).notNull().default('pending'),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  completedAt: timestamp('completed_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, table => [
  uniqueIndex('service_log_upload_sessions_token_uq').on(table.tokenHash),
  index('service_log_upload_sessions_status_idx').on(table.status),
  index('service_log_upload_sessions_expires_idx').on(table.expiresAt),
  index('service_log_upload_sessions_invoice_idx').on(table.invoiceId),
])
