// Applies pending Drizzle migrations using runtime config or DATABASE_URL override.
import { drizzle } from 'drizzle-orm/node-postgres'
import { migrate } from 'drizzle-orm/node-postgres/migrator'
import pg from 'pg'
import { requireDatabaseUrl } from '../server/lib/runtime-config.mjs'

const pool = new pg.Pool({ connectionString: requireDatabaseUrl(), max: 1 })
const db = drizzle({ client: pool })

try {
  await migrate(db, { migrationsFolder: 'server/db/migrations' })
  console.log('[migrate] migrations applied')
}
finally {
  await pool.end()
}
