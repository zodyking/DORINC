import { bigint, boolean, customType, index, integer, pgTable, text, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core'
import { users } from './auth'

/** PostgreSQL bytea — encrypted backup payloads (SPEC §13). */
export const bytea = customType<{ data: Buffer, driverData: Buffer }>({
  dataType() {
    return 'bytea'
  },
})

export const BACKUP_RUN_STATUSES = ['queued', 'running', 'completed', 'failed'] as const
export type BackupRunStatus = (typeof BACKUP_RUN_STATUSES)[number]

export const BACKUP_TRIGGERS = ['manual', 'scheduled', 'safety'] as const
export type BackupTrigger = (typeof BACKUP_TRIGGERS)[number]

export const BACKUP_INTEGRATION_PROVIDERS = ['google_drive'] as const
export type BackupIntegrationProvider = (typeof BACKUP_INTEGRATION_PROVIDERS)[number]

/** Google Drive OAuth credentials — tokens encrypted at rest (SPEC §13). */
export const backupIntegrations = pgTable('backup_integrations', {
  id: uuid('id').primaryKey().defaultRandom(),
  provider: text('provider', { enum: BACKUP_INTEGRATION_PROVIDERS }).notNull().default('google_drive'),
  connected: boolean('connected').notNull().default(false),
  accountEmail: text('account_email'),
  folderId: text('folder_id'),
  encryptedTokens: bytea('encrypted_tokens'),
  tokenExpiresAt: timestamp('token_expires_at', { withTimezone: true }),
  lastTestedAt: timestamp('last_tested_at', { withTimezone: true }),
  lastError: text('last_error'),
  updatedBy: uuid('updated_by').references(() => users.id),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, table => [
  uniqueIndex('backup_integrations_provider_idx').on(table.provider),
])

/** Workspace backup schedule + retention (SPEC §13). */
export const backupSettings = pgTable('backup_settings', {
  id: uuid('id').primaryKey().defaultRandom(),
  enabled: boolean('enabled').notNull().default(false),
  scheduleCron: text('schedule_cron'),
  retentionDaily: integer('retention_daily').notNull().default(30),
  retentionWeekly: integer('retention_weekly').notNull().default(12),
  retentionMonthly: integer('retention_monthly').notNull().default(12),
  storageMode: text('storage_mode').notNull().default('database'),
  notifyEmail: text('notify_email'),
  updatedBy: uuid('updated_by').references(() => users.id),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
})

/** Encrypted backup artifacts — no plaintext retained (SPEC §13). */
export const backupRuns = pgTable('backup_runs', {
  id: uuid('id').primaryKey().defaultRandom(),
  filename: text('filename').notNull(),
  status: text('status', { enum: BACKUP_RUN_STATUSES }).notNull().default('queued'),
  trigger: text('trigger', { enum: BACKUP_TRIGGERS }).notNull().default('manual'),

  dumpBytes: bigint('dump_bytes', { mode: 'number' }),
  compressedBytes: bigint('compressed_bytes', { mode: 'number' }),
  encryptedBytes: bigint('encrypted_bytes', { mode: 'number' }).notNull(),
  sha256Checksum: text('sha256_checksum').notNull(),

  encryptedPayload: bytea('encrypted_payload').notNull(),
  compression: text('compression').notNull().default('zstd'),
  encryption: text('encryption').notNull().default('aes-256-gcm'),

  errorMessage: text('error_message'),
  driveFileId: text('drive_file_id'),
  driveUploadedAt: timestamp('drive_uploaded_at', { withTimezone: true }),
  createdBy: uuid('created_by').references(() => users.id),
  startedAt: timestamp('started_at', { withTimezone: true }),
  finishedAt: timestamp('finished_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, table => [
  index('backup_runs_status_idx').on(table.status),
  index('backup_runs_created_idx').on(table.createdAt),
])
