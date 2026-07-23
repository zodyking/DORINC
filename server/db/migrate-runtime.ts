import { access } from 'node:fs/promises'
import { join } from 'node:path'
import { migrate } from 'drizzle-orm/node-postgres/migrator'
import type { Db } from './client'
import { usePool } from './client'

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
  try {
    await migrate(db, { migrationsFolder })
    console.log(`[migrate] migrations applied from ${migrationsFolder}`)
  }
  catch (err) {
    console.error(`[migrate] failed applying migrations from ${migrationsFolder}`, err)
    throw err
  }

  const { ensureEmailInboxSchema } = await import('../lib/ensure-email-inbox-schema.mjs')
  await ensureEmailInboxSchema(usePool())

  const { ensureAccessGateSchema } = await import('../lib/ensure-access-gate-schema.mjs')
  await ensureAccessGateSchema(usePool())

  const { ensureDocumentChangeRequestsSchema } = await import('../lib/ensure-document-change-requests-schema.mjs')
  await ensureDocumentChangeRequestsSchema(usePool())
}
