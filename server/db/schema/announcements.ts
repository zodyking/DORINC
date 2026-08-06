import { boolean, index, integer, jsonb, pgTable, text, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core'
import { users } from './auth'
import { appFiles } from './files'

export const ANNOUNCEMENT_TARGET_TYPES = ['all', 'account_type', 'user'] as const
export type AnnouncementTargetType = (typeof ANNOUNCEMENT_TARGET_TYPES)[number]

export interface AnnouncementCtaButton {
  label: string
  href: string
  variant?: 'primary' | 'secondary' | 'ghost'
}

/** Admin-authored mandatory login messages shown full-viewport before the dashboard. */
export const announcements = pgTable('announcements', {
  id: uuid('id').primaryKey().defaultRandom(),
  title: text('title').notNull(),
  subtitle: text('subtitle'),
  bodyHtml: text('body_html').notNull().default(''),
  heroImageFileId: uuid('hero_image_file_id').references(() => appFiles.id, { onDelete: 'set null' }),
  ctaButtons: jsonb('cta_buttons').$type<AnnouncementCtaButton[]>().notNull().default([]),
  isActive: boolean('is_active').notNull().default(false),
  /** Lower number shows first when a user has multiple pending messages (1 before 2). */
  priority: integer('priority').notNull().default(0),
  startsAt: timestamp('starts_at', { withTimezone: true }),
  endsAt: timestamp('ends_at', { withTimezone: true }),
  createdBy: uuid('created_by').references(() => users.id, { onDelete: 'set null' }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, table => [
  index('announcements_active_idx').on(table.isActive),
  index('announcements_priority_idx').on(table.priority),
])

export const announcementTargets = pgTable('announcement_targets', {
  id: uuid('id').primaryKey().defaultRandom(),
  announcementId: uuid('announcement_id').notNull().references(() => announcements.id, { onDelete: 'cascade' }),
  targetType: text('target_type', { enum: ANNOUNCEMENT_TARGET_TYPES }).notNull(),
  accountTypeKey: text('account_type_key'),
  userId: uuid('user_id').references(() => users.id, { onDelete: 'cascade' }),
}, table => [
  index('announcement_targets_announcement_idx').on(table.announcementId),
  index('announcement_targets_account_type_idx').on(table.accountTypeKey),
  index('announcement_targets_user_idx').on(table.userId),
])

export const announcementAcknowledgements = pgTable('announcement_acknowledgements', {
  id: uuid('id').primaryKey().defaultRandom(),
  announcementId: uuid('announcement_id').notNull().references(() => announcements.id, { onDelete: 'cascade' }),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  acknowledgedAt: timestamp('acknowledged_at', { withTimezone: true }).notNull().defaultNow(),
}, table => [
  uniqueIndex('announcement_acks_announcement_user_idx').on(table.announcementId, table.userId),
  index('announcement_acks_user_idx').on(table.userId),
])
