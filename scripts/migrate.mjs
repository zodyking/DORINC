// Applies pending Drizzle migrations against DATABASE_URL.
// Used by the one-shot `migrate` compose service and manual deploys.
import { drizzle } from 'drizzle-orm/node-postgres'
import { migrate } from 'drizzle-orm/node-postgres/migrator'
import pg from 'pg'

const url = process.env.DATABASE_URL
if (!url) {
  console.error('[migrate] DATABASE_URL is not set')
  process.exit(1)
}

const pool = new pg.Pool({ connectionString: url, max: 1 })
const db = drizzle({ client: pool })

try {
  await migrate(db, { migrationsFolder: 'server/db/migrations' })
  console.log('[migrate] migrations applied')
}
finally {
  await pool.end()
}
