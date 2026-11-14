import { index, integer, pgTable, real, text, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core'
import { bytea } from './files'
import {
  PRINTER_JOB_STATUSES,
  PRINTER_SIDES,
} from '../../../shared/printers'

export const printers = pgTable('printers', {
  queue: text('queue').primaryKey(),
  label: text('label').notNull(),
  host: text('host').notNull(),
  protocol: text('protocol').notNull().default('socket'),
  identity: text('identity').notNull().default(''),
  driver: text('driver').notNull().default(''),
  tailHostname: text('tail_hostname').notNull().default(''),
  tailIp: text('tail_ip').notNull().default(''),
  imageMode: text('image_mode').notNull().default('auto'),
  imageKey: text('image_key').notNull().default(''),
  imageSource: text('image_source').notNull().default(''),
  imagePath: text('image_path').notNull().default(''),
  imageLicense: text('image_license').notNull().default(''),
  imageAttribution: text('image_attribution').notNull().default(''),
  imagePage: text('image_page').notNull().default(''),
  imageFingerprint: text('image_fingerprint').notNull().default(''),
  imageCandidates: text('image_candidates').notNull().default(''),
  imageData: bytea('image_data'),
  imageContentType: text('image_content_type'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, table => [
  index('printers_host_idx').on(table.host),
])

export const printerJobs = pgTable('printer_jobs', {
  id: uuid('id').primaryKey().defaultRandom(),
  dedupe: text('dedupe'),
  source: text('source').notNull(),
  sender: text('sender').notNull().default(''),
  filename: text('filename').notNull(),
  queue: text('queue').notNull(),
  pages: integer('pages'),
  copies: integer('copies').notNull().default(1),
  sides: text('sides', { enum: PRINTER_SIDES }).notNull().default('one-sided'),
  status: text('status', { enum: PRINTER_JOB_STATUSES }).notNull(),
  cupsId: text('cups_id').notNull().default(''),
  filepath: text('filepath').notNull().default(''),
  fileData: bytea('file_data'),
  documentId: uuid('document_id'),
  error: text('error').notNull().default(''),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, table => [
  uniqueIndex('printer_jobs_dedupe_uq').on(table.dedupe),
  index('printer_jobs_status_idx').on(table.status),
  index('printer_jobs_queue_idx').on(table.queue),
  index('printer_jobs_created_idx').on(table.createdAt),
  index('printer_jobs_document_idx').on(table.documentId),
])

/** One stored PDF per original file name + type, shared by every job that printed it. */
export const printerDocuments = pgTable('printer_documents', {
  id: uuid('id').primaryKey().defaultRandom(),
  filename: text('filename').notNull(),
  fileType: text('file_type').notNull(),
  pages: integer('pages'),
  bytes: integer('bytes').notNull().default(0),
  data: bytea('data').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, table => [
  uniqueIndex('printer_documents_name_type_uq').on(table.filename, table.fileType),
])

export const printerEvents = pgTable('printer_events', {
  id: uuid('id').primaryKey().defaultRandom(),
  level: text('level').notNull().default('info'),
  message: text('message').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, table => [
  index('printer_events_created_idx').on(table.createdAt),
])

export const printerSettings = pgTable('printer_settings', {
  key: text('key').primaryKey(),
  value: text('value').notNull().default(''),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
})

export const printerMailBatches = pgTable('printer_mail_batches', {
  prefix: text('prefix').primaryKey(),
  sender: text('sender').notNull().default(''),
  subject: text('subject').notNull().default(''),
  messageId: text('message_id').notNull().default(''),
  queue: text('queue').notNull().default(''),
  phase: text('phase').notNull().default('new'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
})

export const printerImageCatalog = pgTable('printer_image_catalog', {
  modelKey: text('model_key').primaryKey(),
  manufacturer: text('manufacturer').notNull().default(''),
  model: text('model').notNull().default(''),
  source: text('source').notNull().default(''),
  fingerprintId: text('fingerprint_id').notNull().default(''),
  localPath: text('local_path').notNull().default(''),
  confidence: real('confidence').notNull().default(0),
  license: text('license').notNull().default(''),
  attribution: text('attribution').notNull().default(''),
  sourcePage: text('source_page').notNull().default(''),
  checkedAt: timestamp('checked_at', { withTimezone: true }),
  negativeUntil: timestamp('negative_until', { withTimezone: true }),
  category: text('category').notNull().default('generic'),
  candidates: text('candidates').notNull().default(''),
})
