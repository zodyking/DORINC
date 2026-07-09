import { index, inet, jsonb, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core'

/**
 * Append-only audit log (SPEC §11). Rows are immutable — a DB trigger
 * rejects UPDATE/DELETE, and the service layer exposes writes only.
 * Hash chain fields (P3-07) link each row to the prior entry for tamper detection.
 */
export const auditLogs = pgTable('audit_logs', {
  id: uuid('id').primaryKey().defaultRandom(),

  entityType: text('entity_type').notNull(),
  entityId: text('entity_id'),
  action: text('action').notNull(),

  beforeData: jsonb('before_data'),
  afterData: jsonb('after_data'),
  changedFields: jsonb('changed_fields'),

  // Actor snapshot — survives user renames/disables
  actorUserId: uuid('actor_user_id'),
  actorName: text('actor_name'),
  actorEmail: text('actor_email'),
  actorAccountType: text('actor_account_type'),

  permissionKey: text('permission_key'),
  riskLevel: text('risk_level').notNull().default('normal'),

  ipAddress: inet('ip_address'),
  userAgent: text('user_agent'),
  requestId: text('request_id'),

  previousHash: text('previous_hash'),
  entryHash: text('entry_hash'),

  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, table => [
  index('audit_logs_entity_idx').on(table.entityType, table.entityId),
  index('audit_logs_actor_idx').on(table.actorUserId),
  index('audit_logs_created_at_idx').on(table.createdAt),
  index('audit_logs_entry_hash_idx').on(table.entryHash),
])
