// DORINC pdf-worker — polls pdf_render_jobs and renders via Laravel PDF (DomPDF).
import pg from 'pg'
import { requireDatabaseUrl } from '../lib/runtime-config.mjs'
import { applyPendingMigrationsOnBoot } from '../lib/migrate-on-boot.mjs'
import { verifyDatabaseConnection } from '../lib/verify-database.mjs'
import { touchWorkerHeartbeat } from '../lib/worker-heartbeat.mjs'
import { processPdfRenderJobs } from './handlers/pdf-render.mjs'

const POLL_MS = Number(process.env.WORKER_POLL_MS ?? 3000)

async function tick(pool) {
  await touchWorkerHeartbeat(pool, 'pdf')
  const result = await processPdfRenderJobs(pool)
  if (result.processed || result.failed) {
    console.log(`[pdf-worker] pdf_render processed=${result.processed} failed=${result.failed}`)
  }
}

async function main() {
  try {
    await applyPendingMigrationsOnBoot()
  }
  catch (err) {
    console.error('[pdf-worker] boot migration failed', err)
    process.exit(1)
  }

  await verifyDatabaseConnection('pdf-worker')

  const pool = new pg.Pool({ connectionString: requireDatabaseUrl(), max: 4 })
  console.log(`[pdf-worker] started (poll ${POLL_MS}ms)`)

  for (;;) {
    try {
      await tick(pool)
    }
    catch (err) {
      console.error('[pdf-worker] tick failed', err)
    }
    await new Promise(resolve => setTimeout(resolve, POLL_MS))
  }
}

main()
