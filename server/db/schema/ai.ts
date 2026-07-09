import { boolean, customType, index, integer, jsonb, numeric, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core'
import { users } from './auth'
import { workerJobs } from './jobs'

/** PostgreSQL bytea — encrypted OpenRouter API key (SPEC §10). */
export const bytea = customType<{ data: Buffer, driverData: Buffer }>({
  dataType() {
    return 'bytea'
  },
})

export const AI_PROVIDERS = ['openrouter'] as const
export type AiProvider = (typeof AI_PROVIDERS)[number]

export const AI_FEATURE_TYPES = [
  'service_log_extraction',
  'invoice_description',
  'platform_help',
] as const
export type AiFeatureType = (typeof AI_FEATURE_TYPES)[number]

export const AI_JOB_STATUSES = ['queued', 'processing', 'done', 'failed'] as const
export type AiJobStatus = (typeof AI_JOB_STATUSES)[number]

export const AI_SUGGESTION_STATUSES = ['pending', 'accepted', 'edited', 'rejected'] as const
export type AiSuggestionStatus = (typeof AI_SUGGESTION_STATUSES)[number]

/** Singleton OpenRouter / AI workspace settings (SPEC §10). */
export const aiProviderSettings = pgTable('ai_provider_settings', {
  id: uuid('id').primaryKey().defaultRandom(),
  provider: text('provider', { enum: AI_PROVIDERS }).notNull().default('openrouter'),
  enabled: boolean('enabled').notNull().default(false),
  encryptedApiKey: bytea('encrypted_api_key'),
  defaultModel: text('default_model').notNull().default('anthropic/claude-3.5-sonnet'),
  serviceLogExtractionModel: text('service_log_extraction_model'),
  invoiceDescriptionModel: text('invoice_description_model'),
  platformHelpModel: text('platform_help_model'),
  serviceLogExtractionEnabled: boolean('service_log_extraction_enabled').notNull().default(true),
  invoiceDescriptionEnabled: boolean('invoice_description_enabled').notNull().default(true),
  platformHelpEnabled: boolean('platform_help_enabled').notNull().default(true),
  dailySpendCapUsd: numeric('daily_spend_cap_usd', { precision: 12, scale: 4 }),
  monthlySpendCapUsd: numeric('monthly_spend_cap_usd', { precision: 12, scale: 4 }),
  updatedBy: uuid('updated_by').references(() => users.id),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
})

/** Domain-level AI job rows linked to worker_jobs (SPEC §10, §15). */
export const aiJobs = pgTable('ai_jobs', {
  id: uuid('id').primaryKey().defaultRandom(),
  jobType: text('job_type', { enum: AI_FEATURE_TYPES }).notNull(),
  entityType: text('entity_type').notNull(),
  entityId: uuid('entity_id').notNull(),
  inputPayload: jsonb('input_payload').notNull(),
  outputPayload: jsonb('output_payload'),
  status: text('status', { enum: AI_JOB_STATUSES }).notNull().default('queued'),
  workerJobId: uuid('worker_job_id').references(() => workerJobs.id),
  attempts: integer('attempts').notNull().default(0),
  maxAttempts: integer('max_attempts').notNull().default(3),
  lastError: text('last_error'),
  runAfter: timestamp('run_after', { withTimezone: true }).notNull().defaultNow(),
  startedAt: timestamp('started_at', { withTimezone: true }),
  finishedAt: timestamp('finished_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  createdBy: uuid('created_by').references(() => users.id),
}, table => [
  index('ai_jobs_poll_idx').on(table.status, table.runAfter),
  index('ai_jobs_entity_idx').on(table.entityType, table.entityId),
  index('ai_jobs_type_idx').on(table.jobType),
])

/** Human-review queue for AI outputs — accept/edit/reject only (SPEC §10). */
export const aiSuggestions = pgTable('ai_suggestions', {
  id: uuid('id').primaryKey().defaultRandom(),
  aiJobId: uuid('ai_job_id').notNull().references(() => aiJobs.id),
  featureType: text('feature_type', { enum: AI_FEATURE_TYPES }).notNull(),
  entityType: text('entity_type').notNull(),
  entityId: uuid('entity_id').notNull(),
  originalContent: jsonb('original_content'),
  suggestedContent: jsonb('suggested_content').notNull(),
  status: text('status', { enum: AI_SUGGESTION_STATUSES }).notNull().default('pending'),
  reviewedBy: uuid('reviewed_by').references(() => users.id),
  reviewedAt: timestamp('reviewed_at', { withTimezone: true }),
  reviewNotes: text('review_notes'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, table => [
  index('ai_suggestions_entity_idx').on(table.entityType, table.entityId),
  index('ai_suggestions_status_idx').on(table.status),
  index('ai_suggestions_job_idx').on(table.aiJobId),
])

/** Append-only AI token/cost tracking (SPEC §10). */
export const aiUsageLogs = pgTable('ai_usage_logs', {
  id: uuid('id').primaryKey().defaultRandom(),
  aiJobId: uuid('ai_job_id').references(() => aiJobs.id),
  featureType: text('feature_type', { enum: AI_FEATURE_TYPES }).notNull(),
  model: text('model').notNull(),
  promptTokens: integer('prompt_tokens').notNull().default(0),
  completionTokens: integer('completion_tokens').notNull().default(0),
  totalTokens: integer('total_tokens').notNull().default(0),
  estimatedCostUsd: numeric('estimated_cost_usd', { precision: 12, scale: 4 }).notNull().default('0'),
  provider: text('provider', { enum: AI_PROVIDERS }).notNull().default('openrouter'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  createdBy: uuid('created_by').references(() => users.id),
}, table => [
  index('ai_usage_logs_created_idx').on(table.createdAt),
  index('ai_usage_logs_feature_idx').on(table.featureType),
])
