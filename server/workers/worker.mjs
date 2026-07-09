// DORINC general worker — polls job tables (mail, thumbnails, AI, backups).
// Job handlers are wired in as each phase lands (P1-14 thumbnails, P2-02 mail, ...).
import pg from 'pg'
import { requireDatabaseUrl } from '../lib/runtime-config.mjs'
import { processThumbnailJobs } from './handlers/derivatives.mjs'
import { processMailJobs } from './handlers/mail.mjs'
import { processAiJobs } from './handlers/ai.mjs'
import { maybeEnqueueScheduledBackup, processBackupJobs } from './handlers/backups.mjs'
import { maybeEnqueueRetentionPrune, processRetentionPruneJobs } from './handlers/retention.mjs'

const POLL_MS = Number(process.env.WORKER_POLL_MS ?? 5000)

const pool = new pg.Pool({ connectionString: requireDatabaseUrl(), max: 4 })

console.log(`[worker] general worker started (poll ${POLL_MS}ms)`)

async function tick() {
  const thumbs = await processThumbnailJobs(pool)
  if (thumbs.processed || thumbs.failed) {
    console.log(`[worker] thumbnail_generate processed=${thumbs.processed} failed=${thumbs.failed}`)
  }

  const mail = await processMailJobs(pool)
  if (mail.processed || mail.failed) {
    console.log(`[worker] email_send processed=${mail.processed} failed=${mail.failed}`)
  }

  const ai = await processAiJobs(pool)
  if (ai.processed || ai.failed) {
    console.log(`[worker] ai_jobs processed=${ai.processed} failed=${ai.failed}`)
  }

  const scheduled = await maybeEnqueueScheduledBackup(pool)
  if (scheduled) {
    console.log('[worker] backup_run scheduled job enqueued')
  }

  const backups = await processBackupJobs(pool)
  if (backups.processed || backups.failed) {
    console.log(`[worker] backup_run processed=${backups.processed} failed=${backups.failed}`)
  }

  const retentionScheduled = await maybeEnqueueRetentionPrune(pool)
  if (retentionScheduled) {
    console.log('[worker] backup_retention_prune scheduled job enqueued')
  }

  const retention = await processRetentionPruneJobs(pool)
  if (retention.processed || retention.failed) {
    console.log(`[worker] backup_retention_prune processed=${retention.processed} failed=${retention.failed}`)
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
