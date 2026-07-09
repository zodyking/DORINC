import { boolean, index, inet, integer, jsonb, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core'
import { users } from './auth'
import { backupRuns } from './backups'

export const BACKUP_RECOVERY_TEST_STATUSES = ['running', 'passed', 'failed'] as const
export type BackupRecoveryTestStatus = (typeof BACKUP_RECOVERY_TEST_STATUSES)[number]

/** Admin recovery test runs — decrypt + pg_restore --list without production restore (SPEC §13, P3-09). */
export const backupRecoveryTests = pgTable('backup_recovery_tests', {
  id: uuid('id').primaryKey().defaultRandom(),
  backupRunId: uuid('backup_run_id').notNull().references(() => backupRuns.id, { onDelete: 'cascade' }),
  status: text('status', { enum: BACKUP_RECOVERY_TEST_STATUSES }).notNull().default('running'),
  valid: boolean('valid'),
  tocEntries: integer('toc_entries'),
  errorMessage: text('error_message'),
  testedBy: uuid('tested_by').references(() => users.id),
  startedAt: timestamp('started_at', { withTimezone: true }),
  finishedAt: timestamp('finished_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, table => [
  index('backup_recovery_tests_run_idx').on(table.backupRunId),
  index('backup_recovery_tests_created_idx').on(table.createdAt),
])

export const SUSPICIOUS_ALERT_SEVERITIES = ['low', 'medium', 'high'] as const
export type SuspiciousAlertSeverity = (typeof SUSPICIOUS_ALERT_SEVERITIES)[number]

export const SUSPICIOUS_ALERT_STATUSES = ['open', 'dismissed'] as const
export type SuspiciousAlertStatus = (typeof SUSPICIOUS_ALERT_STATUSES)[number]

/** Rule-based suspicious activity alerts (SPEC §13, P3-10). */
export const suspiciousActivityAlerts = pgTable('suspicious_activity_alerts', {
  id: uuid('id').primaryKey().defaultRandom(),
  ruleKey: text('rule_key').notNull(),
  severity: text('severity', { enum: SUSPICIOUS_ALERT_SEVERITIES }).notNull().default('medium'),
  title: text('title').notNull(),
  description: text('description').notNull(),
  metadata: jsonb('metadata').notNull().default({}),
  actorUserId: uuid('actor_user_id').references(() => users.id),
  ipAddress: inet('ip_address'),
  status: text('status', { enum: SUSPICIOUS_ALERT_STATUSES }).notNull().default('open'),
  dismissedAt: timestamp('dismissed_at', { withTimezone: true }),
  dismissedBy: uuid('dismissed_by').references(() => users.id),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, table => [
  index('suspicious_activity_alerts_status_idx').on(table.status),
  index('suspicious_activity_alerts_created_idx').on(table.createdAt),
  index('suspicious_activity_alerts_rule_idx').on(table.ruleKey),
])
