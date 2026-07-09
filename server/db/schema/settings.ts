import { jsonb, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core'

/**
 * Key/value application settings (SPEC §15 `settings` group).
 * Secret values (OpenRouter key, Google tokens) are stored AES-256-GCM
 * encrypted — never plaintext.
 */
export const appSettings = pgTable('app_settings', {
  id: uuid('id').primaryKey().defaultRandom(),
  key: text('key').notNull().unique(),
  value: jsonb('value'),
  encryptedValue: text('encrypted_value'),
  updatedBy: uuid('updated_by'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
})
