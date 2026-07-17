import { bigint, boolean, index, jsonb, pgTable, text, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core'
import { users } from './auth'
import { customers } from './customers'
import { conversations, messages } from './messages'

export const EMAIL_DIRECTIONS = ['inbound', 'outbound'] as const
export type EmailDirection = (typeof EMAIL_DIRECTIONS)[number]

/** Shared email thread metadata — one row per email conversation. */
export const emailThreads = pgTable('email_threads', {
  conversationId: uuid('conversation_id').primaryKey().references(() => conversations.id, { onDelete: 'cascade' }),
  customerId: uuid('customer_id').references(() => customers.id, { onDelete: 'set null' }),
  counterpartEmail: text('counterpart_email').notNull(),
  counterpartName: text('counterpart_name'),
  subject: text('subject').notNull(),
  rootMessageId: text('root_message_id'),
  /** Staff-composed thread to a non-customer address (visible to all team without Show all). */
  staffInitiated: boolean('staff_initiated').notNull().default(false),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, table => [
  index('email_threads_customer_idx').on(table.customerId),
  index('email_threads_counterpart_idx').on(table.counterpartEmail),
  index('email_threads_updated_idx').on(table.updatedAt),
])

/** RFC822 metadata for messages in email threads. */
export const emailMessageMeta = pgTable('email_message_meta', {
  messageId: uuid('message_id').primaryKey().references(() => messages.id, { onDelete: 'cascade' }),
  direction: text('direction', { enum: EMAIL_DIRECTIONS }).notNull(),
  internetMessageId: text('internet_message_id'),
  inReplyTo: text('in_reply_to'),
  emailReferences: text('email_references'),
  fromAddress: text('from_address').notNull(),
  toAddresses: jsonb('to_addresses').$type<string[]>().notNull().default([]),
  ccAddresses: jsonb('cc_addresses').$type<string[]>().notNull().default([]),
  htmlBody: text('html_body'),
  sentByUserId: uuid('sent_by_user_id').references(() => users.id, { onDelete: 'set null' }),
}, table => [
  uniqueIndex('email_message_meta_internet_message_id_idx').on(table.internetMessageId),
  index('email_message_meta_direction_idx').on(table.direction),
])

/** Per-user read state for shared email threads. */
export const emailConversationReads = pgTable('email_conversation_reads', {
  conversationId: uuid('conversation_id').notNull().references(() => conversations.id, { onDelete: 'cascade' }),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  lastReadAt: timestamp('last_read_at', { withTimezone: true }),
}, table => [
  uniqueIndex('email_conversation_reads_unique').on(table.conversationId, table.userId),
  index('email_conversation_reads_user_idx').on(table.userId),
])

/** IMAP mailbox sync cursor. */
export const imapSyncState = pgTable('imap_sync_state', {
  id: text('id').primaryKey().default('default'),
  mailbox: text('mailbox').notNull().default('INBOX'),
  lastUid: bigint('last_uid', { mode: 'number' }),
  lastSyncAt: timestamp('last_sync_at', { withTimezone: true }),
  lastError: text('last_error'),
})

/** Durable RFC822 tombstones that prevent hard-deleted email threads from returning on IMAP sync. */
export const emailIngestSuppressions = pgTable('email_ingest_suppressions', {
  internetMessageId: text('internet_message_id').primaryKey(),
  sourceConversationId: uuid('source_conversation_id'),
  counterpartEmail: text('counterpart_email'),
  subject: text('subject'),
  deletedBy: uuid('deleted_by').references(() => users.id, { onDelete: 'set null' }),
  deletedAt: timestamp('deleted_at', { withTimezone: true }).notNull().defaultNow(),
}, table => [
  index('email_ingest_suppressions_conversation_idx').on(table.sourceConversationId),
  index('email_ingest_suppressions_deleted_at_idx').on(table.deletedAt),
])
