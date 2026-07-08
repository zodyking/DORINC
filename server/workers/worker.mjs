// DORINC general worker — polls job tables (mail, thumbnails, AI, backups).
// Job handlers are wired in as each phase lands (P1-14 thumbnails, P2-02 mail, ...).
import pg from 'pg'
import { processThumbnailJobs } from './handlers/derivatives.mjs'

const POLL_MS = Number(process.env.WORKER_POLL_MS ?? 5000)

if (!process.env.DATABASE_URL) {
  console.error('[worker] DATABASE_URL is not set')
  process.exit(1)
}

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, max: 4 })

console.log(`[worker] general worker started (poll ${POLL_MS}ms)`)

async function tick() {
  const thumbs = await processThumbnailJobs(pool)
  if (thumbs.processed || thumbs.failed) {
    console.log(`[worker] thumbnail_generate processed=${thumbs.processed} failed=${thumbs.failed}`)
  }
}

async function main() {
  for (;;) {
    try {
      await tick()
    }
    catch (err) {
      console.error('[worker] tick failed', err)
    }
    await new Promise(resolve => setTimeout(resolve, POLL_MS))
  }
}

main()
