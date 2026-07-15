// Apply pending Drizzle migrations on worker/pdf-worker startup (Dockploy has no migrate profile toggle).
import { access } from 'node:fs/promises'
import { join } from 'node:path'
import { drizzle } from 'drizzle-orm/node-postgres'
import { migrate } from 'drizzle-orm/node-postgres/migrator'
import pg from 'pg'
import { getDatabaseUrl } from './runtime-config.mjs'

async function resolveMigrationsFolder() {
  const candidates = [
    join(process.cwd(), 'server/db/migrations'),
    join(process.cwd(), '.output/server/db/migrations'),
    join(process.cwd(), '.data/db-migrations'),
  ]

  for (const folder of candidates) {
    try {
      await access(join(folder, 'meta/_journal.json'))
      return folder
    }
    catch {
      // try next
    }
  }

  throw new Error('Migrations folder not found (expected server/db/migrations)')
}

export async function applyPendingMigrationsOnBoot() {
  const connectionString = getDatabaseUrl()
  if (!connectionString) return

  const pool = new pg.Pool({ connectionString, max: 1 })
  try {
    const db = drizzle({ client: pool })
    const migrationsFolder = await resolveMigrationsFolder()
    await migrate(db, { migrationsFolder })
    console.log('[migrate] pending migrations applied on boot')
  }
  finally {
    await pool.end()
  }
}
