// DORINC general worker — polls job tables (mail, thumbnails, AI, backups).
// Job handlers are wired in as each phase lands (P1-14 thumbnails, P2-02 mail, ...).
import pg from 'pg'
import { requireDatabaseUrl } from '../lib/runtime-config.mjs'
import { applyPendingMigrationsOnBoot } from '../lib/migrate-on-boot.mjs'
import { verifyDatabaseConnection } from '../lib/verify-database.mjs'
import { processThumbnailJobs } from './handlers/derivatives.mjs'
import { processMailJobs } from './handlers/mail.mjs'
import { drainMailQueue } from './handlers/mail-drain.mjs'
import { processInvoiceSendJobs } from './handlers/invoice-send.mjs'
import { processAiJobs } from './handlers/ai.mjs'
import { maybeEnqueueScheduledBackup, processBackupJobs } from './handlers/backups.mjs'
import { maybeEnqueueRetentionPrune, processRetentionPruneJobs } from './handlers/retention.mjs'
import { maybeRunImapInboxSync, processImapSyncJobs } from './handlers/imap-sync.mjs'
import { touchWorkerHeartbeat } from '../lib/worker-heartbeat.mjs'
import { reclaimStaleWorkerJobs } from '../lib/reclaim-stale-jobs.mjs'

const POLL_MS = Number(process.env.WORKER_POLL_MS ?? 1500)
const MAIL_BATCH = Number(process.env.MAIL_BATCH_SIZE ?? 20)

async function tick(pool) {
  const reclaimed = await reclaimStaleWorkerJobs(pool)
  if (reclaimed.length) {
    console.warn(`[worker] reclaimed ${reclaimed.length} stale job(s):`, reclaimed.map(r => `${r.job_type}:${r.status}`).join(', '))
  }

  await touchWorkerHeartbeat(pool, 'general')

  const mail = await drainMailQueue(pool, MAIL_BATCH)
  if (mail.processed || mail.failed) {
    console.log(`[worker] email_send processed=${mail.processed} failed=${mail.failed}`)
  }

  const thumbs = await processThumbnailJobs(pool)
  if (thumbs.processed || thumbs.failed) {
    console.log(`[worker] thumbnail_generate processed=${thumbs.processed} failed=${thumbs.failed}`)
  }

  const invoiceSend = await processInvoiceSendJobs(pool)
  if (invoiceSend.processed || invoiceSend.failed) {
    console.log(`[worker] invoice_send processed=${invoiceSend.processed} failed=${invoiceSend.failed}`)
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

  const imapInline = await maybeRunImapInboxSync(pool)
  if (imapInline?.ingested) {
    console.log(`[worker] imap_sync inline ingested=${imapInline.ingested} skipped=${imapInline.skipped}`)
  }

  const imap = await processImapSyncJobs(pool)
  if (imap.processed || imap.failed) {
    console.log(`[worker] imap_sync processed=${imap.processed} failed=${imap.failed}`)
  }
}

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
      await tick(pool)
    }
    catch (err) {
      console.error('[worker] tick failed', err)
    }
    await new Promise(resolve => setTimeout(resolve, POLL_MS))
  }
}

main()
