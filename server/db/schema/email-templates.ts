import { boolean, index, jsonb, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core'
import { users } from './auth'
import type { EmailTemplateContent } from '../../../shared/email-template-catalog'

export type { EmailTemplateContent } from '../../../shared/email-template-catalog'

/**
 * Editable transactional email templates (Control Panel → Email Templates).
 * One row per email type key; when is_active is true, saved content overrides code defaults.
 */
export const emailTemplates = pgTable('email_templates', {
  id: uuid('id').primaryKey().defaultRandom(),
  typeKey: text('type_key').notNull().unique(),
  name: text('name').notNull(),
  isActive: boolean('is_active').notNull().default(false),
  content: jsonb('content').$type<EmailTemplateContent>().notNull(),
  updatedBy: uuid('updated_by').references(() => users.id),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, table => [
  index('email_templates_active_idx').on(table.isActive),
])
