// DORINC pdf-worker — renders official PDFs with Playwright Chromium (SPEC §9, P1-28).
import pg from 'pg'
import { processPdfRenderJobs } from './handlers/pdf-render.mjs'

const POLL_MS = Number(process.env.WORKER_POLL_MS ?? 3000)

if (!process.env.DATABASE_URL) {
  console.error('[pdf-worker] DATABASE_URL is not set')
  process.exit(1)
}

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, max: 4 })

console.log(`[pdf-worker] started (poll ${POLL_MS}ms)`)

async function tick() {
  const result = await processPdfRenderJobs(pool)
  if (result.processed || result.failed) {
    console.log(`[pdf-worker] pdf_render processed=${result.processed} failed=${result.failed}`)
  }
}

async function main() {
  for (;;) {
    try {
      await tick()
    }
    catch (err) {
      console.error('[pdf-worker] tick failed', err)
    }
    await new Promise(resolve => setTimeout(resolve, POLL_MS))
  }
}

main()
