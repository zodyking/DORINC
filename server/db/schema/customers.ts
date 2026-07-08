import { boolean, index, jsonb, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core'
import { users } from './auth'

export interface Address {
  line1?: string
  line2?: string
  city?: string
  state?: string
  zip?: string
}

/** Customers — archived, never hard-deleted (SPEC §6.1, §22.15). */
export const customers = pgTable('customers', {
  id: uuid('id').primaryKey().defaultRandom(),

  displayName: text('display_name').notNull(),
  accountKind: text('account_kind', { enum: ['fleet', 'individual'] }).notNull().default('individual'),

  email: text('email'),
  phone: text('phone'),

  billingAddress: jsonb('billing_address').$type<Address>(),
  serviceAddress: jsonb('service_address').$type<Address>(),

  taxExempt: boolean('tax_exempt').notNull().default(false),
  paymentTerms: text('payment_terms').notNull().default('due_on_receipt'),
  notes: text('notes'),

  portalEnabled: boolean('portal_enabled').notNull().default(false),

  createdBy: uuid('created_by').references(() => users.id),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  archivedAt: timestamp('archived_at', { withTimezone: true }),
}, table => [
  index('customers_display_name_idx').on(table.displayName),
  index('customers_archived_idx').on(table.archivedAt),
])

export const customerContacts = pgTable('customer_contacts', {
  id: uuid('id').primaryKey().defaultRandom(),
  customerId: uuid('customer_id').notNull().references(() => customers.id, { onDelete: 'cascade' }),

  name: text('name').notNull(),
  email: text('email'),
  phone: text('phone'),
  title: text('title'),

  isPrimary: boolean('is_primary').notNull().default(false),
  isBilling: boolean('is_billing').notNull().default(false),

  // Set when this contact has a portal login (SPEC §6.1)
  portalUserId: uuid('portal_user_id').references(() => users.id),

  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  archivedAt: timestamp('archived_at', { withTimezone: true }),
}, table => [
  index('customer_contacts_customer_idx').on(table.customerId),
])
