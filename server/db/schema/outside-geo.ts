import { index, inet, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core'

/**
 * Short-lived 6-digit challenges for known users accessing from outside the geofence.
 * Created at runtime via ensure-outside-geo-schema (no journaled migration).
 */
export const outsideGeoChallenges = pgTable('outside_geo_challenges', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').notNull(),
  userName: text('user_name').notNull(),
  userEmail: text('user_email').notNull(),
  codeHash: text('code_hash').notNull(),
  ipAddress: inet('ip_address'),
  userAgent: text('user_agent'),
  locationLabel: text('location_label'),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  usedAt: timestamp('used_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, table => [
  index('outside_geo_challenges_user_idx').on(table.userId),
  index('outside_geo_challenges_expires_idx').on(table.expiresAt),
  index('outside_geo_challenges_ip_idx').on(table.ipAddress),
])
