// DORINC pdf-worker — renders official PDFs with Playwright Chromium (SPEC §9, P1-28).
import pg from 'pg'
import { requireDatabaseUrl } from '../lib/runtime-config.mjs'
import { applyPendingMigrationsOnBoot } from '../lib/migrate-on-boot.mjs'
import { processPdfRenderJobs } from './handlers/pdf-render.mjs'

const POLL_MS = Number(process.env.WORKER_POLL_MS ?? 3000)

async function tick(pool) {
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
  }

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
