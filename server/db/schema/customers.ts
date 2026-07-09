import { boolean, index, jsonb, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core'
import { users } from './auth'
import { workerJobs } from './jobs'

export interface Address {
  line1?: string
  line2?: string
  city?: string
  state?: string
  zip?: string
}

/** Customers — hard-delete allowed; related invoices/logs keep frozen snapshots. */
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

export const CREDENTIAL_EMAIL_SEND_TYPES = ['initial', 'resend'] as const
export type CredentialEmailSendType = (typeof CREDENTIAL_EMAIL_SEND_TYPES)[number]

export const CREDENTIAL_EMAIL_STATUSES = ['queued', 'sent', 'failed'] as const
export type CredentialEmailStatus = (typeof CREDENTIAL_EMAIL_STATUSES)[number]

/** Append-only log of every portal credential email (SPEC §5, §7). */
export const customerCredentialEmailLogs = pgTable('customer_credential_email_logs', {
  id: uuid('id').primaryKey().defaultRandom(),
  customerId: uuid('customer_id').notNull().references(() => customers.id, { onDelete: 'cascade' }),
  contactId: uuid('contact_id').references(() => customerContacts.id),
  portalUserId: uuid('portal_user_id').notNull().references(() => users.id),
  recipientEmail: text('recipient_email').notNull(),
  sendType: text('send_type', { enum: CREDENTIAL_EMAIL_SEND_TYPES }).notNull(),
  status: text('status', { enum: CREDENTIAL_EMAIL_STATUSES }).notNull().default('queued'),
  workerJobId: uuid('worker_job_id').references(() => workerJobs.id),
  sentAt: timestamp('sent_at', { withTimezone: true }),
  sentBy: uuid('sent_by').notNull().references(() => users.id),
  errorMessage: text('error_message'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, table => [
  index('customer_credential_email_logs_customer_idx').on(table.customerId),
  index('customer_credential_email_logs_created_idx').on(table.createdAt),
])
