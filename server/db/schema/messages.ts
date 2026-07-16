import { index, integer, pgTable, text, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core'
import { users } from './auth'

export const MESSAGE_ENTITY_TYPES = ['customer', 'vehicle', 'service_log', 'invoice'] as const
export type MessageEntityType = (typeof MESSAGE_ENTITY_TYPES)[number]

export const CONVERSATION_TYPES = ['dm', 'email'] as const
export type ConversationType = (typeof CONVERSATION_TYPES)[number]

/** Staff direct-message threads. */
export const conversations = pgTable('conversations', {
  id: uuid('id').primaryKey().defaultRandom(),
  type: text('type', { enum: CONVERSATION_TYPES }).notNull().default('dm'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, table => [
  index('conversations_updated_idx').on(table.updatedAt),
])

export const conversationParticipants = pgTable('conversation_participants', {
  id: uuid('id').primaryKey().defaultRandom(),
  conversationId: uuid('conversation_id').notNull().references(() => conversations.id, { onDelete: 'cascade' }),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  lastReadAt: timestamp('last_read_at', { withTimezone: true }),
  joinedAt: timestamp('joined_at', { withTimezone: true }).notNull().defaultNow(),
}, table => [
  uniqueIndex('conversation_participants_unique').on(table.conversationId, table.userId),
  index('conversation_participants_user_idx').on(table.userId),
])

export const messages = pgTable('messages', {
  id: uuid('id').primaryKey().defaultRandom(),
  conversationId: uuid('conversation_id').notNull().references(() => conversations.id, { onDelete: 'cascade' }),
  senderUserId: uuid('sender_user_id').references(() => users.id),
  body: text('body').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  editedAt: timestamp('edited_at', { withTimezone: true }),
}, table => [
  index('messages_conversation_idx').on(table.conversationId, table.createdAt),
  index('messages_sender_idx').on(table.senderUserId),
])

/** Denormalized entity references embedded in message bodies. */
export const messageEntityRefs = pgTable('message_entity_refs', {
  id: uuid('id').primaryKey().defaultRandom(),
  messageId: uuid('message_id').notNull().references(() => messages.id, { onDelete: 'cascade' }),
  entityType: text('entity_type', { enum: MESSAGE_ENTITY_TYPES }).notNull(),
  entityId: uuid('entity_id').notNull(),
  entityLabel: text('entity_label').notNull(),
  position: integer('position').notNull().default(0),
}, table => [
  index('message_entity_refs_message_idx').on(table.messageId),
  index('message_entity_refs_entity_idx').on(table.entityType, table.entityId),
])
