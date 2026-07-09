import { boolean, index, inet, pgTable, text, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core'

/** Account types — fixed bundles, no roles layer (SPEC §4). */
export const accountTypes = pgTable('account_types', {
  id: uuid('id').primaryKey().defaultRandom(),
  key: text('key').notNull().unique(),
  name: text('name').notNull(),
  description: text('description'),
  isSystem: boolean('is_system').notNull().default(true),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
})

export const permissions = pgTable('permissions', {
  id: uuid('id').primaryKey().defaultRandom(),
  key: text('key').notNull().unique(),
  description: text('description'),
  module: text('module').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
})

export const accountTypePermissions = pgTable('account_type_permissions', {
  id: uuid('id').primaryKey().defaultRandom(),
  accountTypeId: uuid('account_type_id').notNull().references(() => accountTypes.id, { onDelete: 'cascade' }),
  permissionId: uuid('permission_id').notNull().references(() => permissions.id, { onDelete: 'cascade' }),
}, table => [
  uniqueIndex('account_type_permissions_unique').on(table.accountTypeId, table.permissionId),
])

export const users = pgTable('users', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: text('name').notNull(),
  email: text('email').notNull(),
  /** Customer portal login id (short company slug). Staff accounts leave this null. */
  username: text('username'),
  passwordHash: text('password_hash').notNull(),
  accountTypeId: uuid('account_type_id').notNull().references(() => accountTypes.id),

  // Users are disabled, never deleted (SPEC §22.14)
  isActive: boolean('is_active').notNull().default(true),
  disabledAt: timestamp('disabled_at', { withTimezone: true }),

  emailVerifiedAt: timestamp('email_verified_at', { withTimezone: true }),
  approvedAt: timestamp('approved_at', { withTimezone: true }),
  approvedBy: uuid('approved_by'),
  rejectedAt: timestamp('rejected_at', { withTimezone: true }),
  rejectedReason: text('rejected_reason'),

  // Customer portal linkage (FK added with customers schema in P1-07)
  customerId: uuid('customer_id'),

  mustChangePassword: boolean('must_change_password').notNull().default(false),
  tempPasswordExpiresAt: timestamp('temp_password_expires_at', { withTimezone: true }),

  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, table => [
  uniqueIndex('users_email_unique').on(table.email),
  uniqueIndex('users_username_unique').on(table.username),
  index('users_account_type_idx').on(table.accountTypeId),
  index('users_customer_idx').on(table.customerId),
])

export const userPermissionOverrides = pgTable('user_permission_overrides', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  permissionId: uuid('permission_id').notNull().references(() => permissions.id, { onDelete: 'cascade' }),
  effect: text('effect', { enum: ['allow', 'deny'] }).notNull(),
  reason: text('reason'),
  createdBy: uuid('created_by'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, table => [
  uniqueIndex('user_permission_overrides_unique').on(table.userId, table.permissionId),
])

/** DB-backed sessions — cookie stores the raw token, DB stores its sha256 (SPEC §5). */
export const sessions = pgTable('sessions', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  tokenHash: text('token_hash').notNull().unique(),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  lastActivityAt: timestamp('last_activity_at', { withTimezone: true }).notNull().defaultNow(),
  ipAddress: inet('ip_address'),
  userAgent: text('user_agent'),
  revokedAt: timestamp('revoked_at', { withTimezone: true }),
  stepUpVerifiedAt: timestamp('step_up_verified_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, table => [
  index('sessions_user_idx').on(table.userId),
  index('sessions_expires_idx').on(table.expiresAt),
])

export const emailVerificationTokens = pgTable('email_verification_tokens', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  tokenHash: text('token_hash').notNull().unique(),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  usedAt: timestamp('used_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, table => [
  index('email_verification_tokens_user_idx').on(table.userId),
])
