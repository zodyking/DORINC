import { bigint, index, pgTable, timestamp, uuid } from 'drizzle-orm/pg-core'

/** Periodic PostgreSQL size samples for the control panel growth chart. */
export const dbSizeSnapshots = pgTable('db_size_snapshots', {
  id: uuid('id').primaryKey().defaultRandom(),
  recordedAt: timestamp('recorded_at', { withTimezone: true }).notNull().defaultNow(),
  databaseBytes: bigint('database_bytes', { mode: 'bigint' }).notNull(),
}, table => [
  index('db_size_snapshots_recorded_at_idx').on(table.recordedAt),
])
