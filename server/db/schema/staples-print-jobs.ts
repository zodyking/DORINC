import { index, pgTable, text, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core'
import { bytea } from './files'

export const STAPLES_PRINT_JOB_STATUSES = [
  'queued',
  'emailed',
  'awaiting_reply',
  'ready',
  'failed',
  'expired',
  'dismissed',
] as const

export type StaplesPrintJobStatus = (typeof STAPLES_PRINT_JOB_STATUSES)[number]

export const STAPLES_PRINT_DOCUMENT_TYPES = [
  'service_log_sheet',
  'invoice',
  'invoice_batch',
] as const

export type StaplesPrintDocumentType = (typeof STAPLES_PRINT_DOCUMENT_TYPES)[number]

/**
 * Staples PrintMe email-to-print jobs (blank service log sheet or invoice PDF).
 * Outbound PDF is emailed to PrintMe and stored for preview; IMAP matches the release-code reply.
 */
export const staplesPrintJobs = pgTable('staples_print_jobs', {
  id: uuid('id').primaryKey().defaultRandom(),
  createdBy: uuid('created_by').notNull(),
  documentType: text('document_type').notNull().default('service_log_sheet'),
  documentLabel: text('document_label'),
  entityId: uuid('entity_id'),
  status: text('status', { enum: STAPLES_PRINT_JOB_STATUSES }).notNull().default('queued'),
  subjectToken: text('subject_token').notNull(),
  outboundMessageId: text('outbound_message_id'),
  releaseCode: text('release_code'),
  replyInternetMessageId: text('reply_internet_message_id'),
  barcodeImage: bytea('barcode_image'),
  barcodeContentType: text('barcode_content_type'),
  pdfData: bytea('pdf_data'),
  pdfFilename: text('pdf_filename'),
  errorMessage: text('error_message'),
  emailedAt: timestamp('emailed_at', { withTimezone: true }),
  readyAt: timestamp('ready_at', { withTimezone: true }),
  expiresAt: timestamp('expires_at', { withTimezone: true }),
  dismissedAt: timestamp('dismissed_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, table => [
  uniqueIndex('staples_print_jobs_token_uq').on(table.subjectToken),
  index('staples_print_jobs_status_idx').on(table.status),
  index('staples_print_jobs_outbound_idx').on(table.outboundMessageId),
  index('staples_print_jobs_created_by_idx').on(table.createdBy),
  index('staples_print_jobs_dismissed_idx').on(table.dismissedAt),
  index('staples_print_jobs_entity_idx').on(table.documentType, table.entityId),
  index('staples_print_jobs_document_type_idx').on(table.documentType),
])
