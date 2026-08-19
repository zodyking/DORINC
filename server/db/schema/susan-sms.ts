import { index, jsonb, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core'
import { users } from './auth'
import type { SusanSmsPendingAction } from '../../../shared/susan-sms-actions'

export interface SusanSmsHistoryMessage {
  role: 'user' | 'assistant'
  content: string
  at: string
}

/**
 * Multi-turn Susan AI SMS threads keyed by staff user + phone.
 * Used when Quo inbound webhooks relay texts to platform help.
 */
export const susanSmsThreads = pgTable('susan_sms_threads', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }).unique(),
  phone: text('phone').notNull(),
  messages: jsonb('messages').$type<SusanSmsHistoryMessage[]>().notNull().default([]),
  lastInboundMessageId: text('last_inbound_message_id'),
  pendingAction: jsonb('pending_action').$type<SusanSmsPendingAction | null>(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, table => [
  index('susan_sms_threads_phone_idx').on(table.phone),
])
