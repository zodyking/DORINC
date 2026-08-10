import { boolean, index, jsonb, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core'
import { users } from './auth'

/**
 * Editable SMS template overrides for Quo (mirrors email_templates).
 * Only active rows override catalog defaults at send time.
 */
export const smsTemplates = pgTable('sms_templates', {
  id: uuid('id').primaryKey().defaultRandom(),
  typeKey: text('type_key').notNull().unique(),
  name: text('name').notNull(),
  isActive: boolean('is_active').notNull().default(false),
  content: jsonb('content').notNull().$type<{ body: string }>(),
  updatedBy: uuid('updated_by').references(() => users.id),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, table => [
  index('sms_templates_active_idx').on(table.isActive),
])
