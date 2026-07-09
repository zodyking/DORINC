import { index, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core'

export const RATE_LIMIT_SCOPES = [
  'login',
  'verify_email',
  'credential_send',
  'ai',
  'upload',
  'pdf_gen',
  'backup',
] as const
export type RateLimitScope = (typeof RATE_LIMIT_SCOPES)[number]

/** Sliding-window rate limit events (SPEC §19). */
export const rateLimitEvents = pgTable('rate_limit_events', {
  id: uuid('id').primaryKey().defaultRandom(),
  scope: text('scope', { enum: RATE_LIMIT_SCOPES }).notNull(),
  key: text('key').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, table => [
  index('rate_limit_events_scope_key_created_idx').on(table.scope, table.key, table.createdAt),
])
