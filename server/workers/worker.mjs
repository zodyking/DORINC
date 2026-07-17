// DORINC general worker — polls job tables (mail, thumbnails, AI, backups).
import pg from 'pg'
import { requireDatabaseUrl } from '../lib/runtime-config.mjs'
import { applyPendingMigrationsOnBoot } from '../lib/migrate-on-boot.mjs'
import { verifyDatabaseConnection } from '../lib/verify-database.mjs'
import { runGeneralWorkerTick } from '../lib/general-worker-tick.mjs'

const POLL_MS = Number(process.env.WORKER_POLL_MS ?? 1500)

async function main() {
  try {
    await applyPendingMigrationsOnBoot()
  }
  catch (err) {
    console.error('[worker] boot migration failed', err)
    process.exit(1)
  }

  await verifyDatabaseConnection('worker')

  const pool = new pg.Pool({ connectionString: requireDatabaseUrl(), max: 4 })
  console.log(`[worker] general worker started (poll ${POLL_MS}ms)`)

  for (;;) {
    try {
      await runGeneralWorkerTick(pool)
    }
    catch (err) {
      console.error('[worker] tick failed', err)
    }
    await new Promise(resolve => setTimeout(resolve, POLL_MS))
  }
}

main()
