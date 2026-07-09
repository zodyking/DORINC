import { cleanupE2EFixtures, ensureE2EFixtures, clearE2ESessionCache } from './helpers/fixtures'
import { rateLimitEvents } from '../../server/db/schema/rate-limits'
import { drizzle } from 'drizzle-orm/node-postgres'
import { Pool } from 'pg'

export default async function globalSetup() {
  if (!process.env.DATABASE_URL) return
  clearE2ESessionCache()
  // Clear login rate limits from prior vitest/integration runs so E2E can authenticate.
  const pool = new Pool({ connectionString: process.env.DATABASE_URL })
  const db = drizzle({ client: pool })
  await db.delete(rateLimitEvents)
  await pool.end()
  await ensureE2EFixtures()
}

export async function globalTeardown() {
  await cleanupE2EFixtures()
}
