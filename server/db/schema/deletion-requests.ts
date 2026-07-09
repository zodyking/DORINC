import { index, pgTable, text, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core'
import { sql } from 'drizzle-orm'
import { users } from './auth'

export const DELETION_ENTITY_TYPES = ['customer', 'vehicle', 'service_log', 'invoice'] as const
export type DeletionEntityType = (typeof DELETION_ENTITY_TYPES)[number]

export const DELETION_REQUEST_STATUSES = ['pending', 'approved', 'rejected'] as const
export type DeletionRequestStatus = (typeof DELETION_REQUEST_STATUSES)[number]

/** Staff-initiated deletion requests — admin approval executes archive/void (SPEC §12). */
export const entityDeletionRequests = pgTable('entity_deletion_requests', {
  id: uuid('id').primaryKey().defaultRandom(),
  entityType: text('entity_type', { enum: DELETION_ENTITY_TYPES }).notNull(),
  entityId: uuid('entity_id').notNull(),
  status: text('status', { enum: DELETION_REQUEST_STATUSES }).notNull().default('pending'),
  reason: text('reason').notNull(),
  entityLabel: text('entity_label').notNull(),
  submittedBy: uuid('submitted_by').notNull().references(() => users.id),
  reviewedBy: uuid('reviewed_by').references(() => users.id),
  reviewedAt: timestamp('reviewed_at', { withTimezone: true }),
  reviewReason: text('review_reason'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, table => [
  index('entity_deletion_requests_status_idx').on(table.status),
  index('entity_deletion_requests_entity_idx').on(table.entityType, table.entityId),
  uniqueIndex('entity_deletion_requests_pending_uq')
    .on(table.entityType, table.entityId)
    .where(sql`status = 'pending'`),
])
