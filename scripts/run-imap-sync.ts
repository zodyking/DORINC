// Runs IMAP inbox sync outside the Nitro request context (worker / CLI).
import { config } from 'dotenv'
import { drizzle } from 'drizzle-orm/node-postgres'
import { Pool } from 'pg'
import * as schema from '../server/db/schema'
import { syncImapInbox } from '../server/services/imap-sync.service'
import { refreshImapConfigCache } from '../server/services/imap-config.service'
import { refreshAppConfigCache } from '../server/services/app-config.service'
import { getDatabaseUrl } from '../server/services/runtime-config.service'

config()

async function main() {
  const url = getDatabaseUrl()
  if (!url) {
    console.error('[imap-sync] DATABASE_URL is not configured')
    process.exit(1)
  }

  const pool = new Pool({ connectionString: url, max: 2 })
  const db = drizzle({ client: pool, schema })

  try {
    await refreshAppConfigCache(db)
    await refreshImapConfigCache(db)
    const result = await syncImapInbox(db, { full: process.argv.includes('--full') })
    console.log(`[imap-sync] fetched=${result.fetched} ingested=${result.ingested} skipped=${result.skipped} errors=${result.errors}`)
  }
  finally {
    await pool.end()
  }
}

main().catch((err) => {
  console.error('[imap-sync] failed', err)
  process.exit(1)
})
