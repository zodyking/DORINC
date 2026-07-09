import { boolean, index, integer, jsonb, pgTable, text, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core'
import { users } from './auth'
import type { InvoiceTemplateDesignSettings } from '../../../shared/invoice-template-design'

export type { InvoiceTemplateDesignSettings } from '../../../shared/invoice-template-design'
export { DEFAULT_INVOICE_TEMPLATE_DESIGN } from '../../../shared/invoice-template-design'

export const INVOICE_TEMPLATE_VERSION_STATUSES = ['draft', 'published', 'archived'] as const
export type InvoiceTemplateVersionStatus = (typeof INVOICE_TEMPLATE_VERSION_STATUSES)[number]

/**
 * Invoice PDF templates — default "Professional Bill Matrix" seeded in P1-27.
 * Versions hold immutable HTML + designer settings once published.
 */
export const invoiceTemplates = pgTable('invoice_templates', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: text('name').notNull(),
  slug: text('slug').notNull().unique(),
  isDefault: boolean('is_default').notNull().default(false),
  createdBy: uuid('created_by').references(() => users.id),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  archivedAt: timestamp('archived_at', { withTimezone: true }),
}, table => [
  index('invoice_templates_default_idx').on(table.isDefault),
])

export const invoiceTemplateVersions = pgTable('invoice_template_versions', {
  id: uuid('id').primaryKey().defaultRandom(),
  templateId: uuid('template_id').notNull().references(() => invoiceTemplates.id, { onDelete: 'cascade' }),
  versionNumber: integer('version_number').notNull(),
  status: text('status', { enum: INVOICE_TEMPLATE_VERSION_STATUSES }).notNull().default('draft'),
  htmlContent: text('html_content').notNull(),
  designSettings: jsonb('design_settings').$type<InvoiceTemplateDesignSettings>().notNull(),
  publishedAt: timestamp('published_at', { withTimezone: true }),
  publishedBy: uuid('published_by').references(() => users.id),
  createdBy: uuid('created_by').references(() => users.id),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, table => [
  uniqueIndex('invoice_template_versions_template_version_idx').on(table.templateId, table.versionNumber),
  index('invoice_template_versions_template_idx').on(table.templateId),
  index('invoice_template_versions_status_idx').on(table.status),
])
