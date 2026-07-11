import { index, integer, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core'
import { users } from './auth'
import { appFiles } from './files'
import { invoiceTemplateVersions } from './invoice-templates'

export const PDF_RENDER_ENTITY_TYPES = ['invoice', 'estimate'] as const
export type PdfRenderEntityType = (typeof PDF_RENDER_ENTITY_TYPES)[number]

export const PDF_RENDER_STATUSES = ['queued', 'processing', 'done', 'failed'] as const
export type PdfRenderStatus = (typeof PDF_RENDER_STATUSES)[number]

/**
 * PDF render queue polled by the pdf-worker container (SPEC §9, §18).
 * Stores a JSON Blade render payload; Laravel + barryvdh/laravel-dompdf produces the PDF.
 */
export const pdfRenderJobs = pgTable('pdf_render_jobs', {
  id: uuid('id').primaryKey().defaultRandom(),

  entityType: text('entity_type', { enum: PDF_RENDER_ENTITY_TYPES }).notNull(),
  entityId: uuid('entity_id').notNull(),
  templateVersionId: uuid('template_version_id').references(() => invoiceTemplateVersions.id),

  /** Serialized Blade render payload JSON (column legacy name: html_content). */
  renderPayload: text('html_content').notNull(),
  originalFilename: text('original_filename').notNull(),
  outputFileId: uuid('output_file_id').references(() => appFiles.id),

  status: text('status', { enum: PDF_RENDER_STATUSES }).notNull().default('queued'),
  attempts: integer('attempts').notNull().default(0),
  maxAttempts: integer('max_attempts').notNull().default(3),
  lastError: text('last_error'),

  runAfter: timestamp('run_after', { withTimezone: true }).notNull().defaultNow(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  startedAt: timestamp('started_at', { withTimezone: true }),
  finishedAt: timestamp('finished_at', { withTimezone: true }),
  createdBy: uuid('created_by').references(() => users.id),
}, table => [
  index('pdf_render_jobs_poll_idx').on(table.status, table.runAfter),
  index('pdf_render_jobs_entity_idx').on(table.entityType, table.entityId),
])
