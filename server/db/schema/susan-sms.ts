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
  /** Last inbound that received a Susan reply. Idle timeout is 5 minutes from this. */
  lastUserAt: timestamp('last_user_at', { withTimezone: true }),
  /** Set when the idle-timeout SMS is sent (or STOP/carrier closes the session). */
  idleClosedAt: timestamp('idle_closed_at', { withTimezone: true }),
  /** Last periodic how-to SMS. At most once per 72 hours. */
  lastIntroAt: timestamp('last_intro_at', { withTimezone: true }),
  /** Set when the staffer texts a carrier keyword (STOP/CANCEL). No further pings. */
  optedOutAt: timestamp('opted_out_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, table => [
  index('susan_sms_threads_phone_idx').on(table.phone),
])
