import { access } from 'node:fs/promises'
import { join } from 'node:path'
import { migrate } from 'drizzle-orm/node-postgres/migrator'
import type { Db } from './client'

async function resolveMigrationsFolder(): Promise<string> {
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

  throw new Error(
    `Can't find meta/_journal.json — expected migrations under ${candidates[0]}. Redeploy so the Docker image includes server/db/migrations.`,
  )
}

export async function applyPendingMigrations(db: Db): Promise<void> {
  const migrationsFolder = await resolveMigrationsFolder()
  await migrate(db, { migrationsFolder })
}
