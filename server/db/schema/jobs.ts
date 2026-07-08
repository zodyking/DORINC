import { index, integer, jsonb, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core'

export const WORKER_JOB_TYPES = [
  'thumbnail_generate',
  'email_send',
  'service_log_ai_extraction',
  'invoice_description_ai',
  'backup_run',
  'backup_verify',
  'pdf_render',
] as const
export type WorkerJobType = (typeof WORKER_JOB_TYPES)[number]

export const WORKER_JOB_STATUSES = ['queued', 'processing', 'done', 'failed'] as const
export type WorkerJobStatus = (typeof WORKER_JOB_STATUSES)[number]

/**
 * Generic background job queue polled by the worker containers (SPEC §18).
 * Jobs are retry-safe: attempts tracked, errors stored, exponential backoff
 * via run_after, and rows are claimed with FOR UPDATE SKIP LOCKED.
 */
export const workerJobs = pgTable('worker_jobs', {
  id: uuid('id').primaryKey().defaultRandom(),
  jobType: text('job_type', { enum: WORKER_JOB_TYPES }).notNull(),
  payload: jsonb('payload').notNull(),

  status: text('status', { enum: WORKER_JOB_STATUSES }).notNull().default('queued'),
  attempts: integer('attempts').notNull().default(0),
  maxAttempts: integer('max_attempts').notNull().default(3),
  lastError: text('last_error'),

  runAfter: timestamp('run_after', { withTimezone: true }).notNull().defaultNow(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  startedAt: timestamp('started_at', { withTimezone: true }),
  finishedAt: timestamp('finished_at', { withTimezone: true }),
}, table => [
  index('worker_jobs_poll_idx').on(table.status, table.runAfter),
  index('worker_jobs_type_idx').on(table.jobType),
])
