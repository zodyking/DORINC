import { index, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core'
import { users } from './auth'

/** Entity types that support concurrent-edit locks (SPEC §12). */
export const EDITABLE_ENTITY_TYPES = ['invoice', 'estimate'] as const
export type EditableEntityType = (typeof EDITABLE_ENTITY_TYPES)[number]

/** Active editing sessions — one active lock per entity; stale after missed heartbeats. */
export const editingSessions = pgTable('editing_sessions', {
  id: uuid('id').primaryKey().defaultRandom(),

  entityType: text('entity_type', { enum: EDITABLE_ENTITY_TYPES }).notNull(),
  entityId: uuid('entity_id').notNull(),

  userId: uuid('user_id').notNull().references(() => users.id),
  userNameSnapshot: text('user_name_snapshot').notNull(),

  lastHeartbeatAt: timestamp('last_heartbeat_at', { withTimezone: true }).notNull().defaultNow(),
  acquiredAt: timestamp('acquired_at', { withTimezone: true }).notNull().defaultNow(),
  releasedAt: timestamp('released_at', { withTimezone: true }),
}, table => [
  index('editing_sessions_entity_idx').on(table.entityType, table.entityId),
  index('editing_sessions_user_idx').on(table.userId),
  index('editing_sessions_active_idx').on(table.entityType, table.entityId, table.releasedAt),
])
