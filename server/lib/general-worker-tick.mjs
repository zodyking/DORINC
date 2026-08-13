// Shared general-worker tick — used by worker.mjs and embedded Nitro workers.
import { processThumbnailJobs } from '../workers/handlers/derivatives.mjs'
import { drainMailQueue } from '../workers/handlers/mail-drain.mjs'
import { processSmsJobs } from '../workers/handlers/sms.mjs'
import { processInvoiceSendJobs } from '../workers/handlers/invoice-send.mjs'
import { processAiJobs } from '../workers/handlers/ai.mjs'
import { processDeletionAiReviewJobs } from '../workers/handlers/deletion-ai-review.mjs'
import { maybeEnqueueScheduledBackup, processBackupJobs } from '../workers/handlers/backups.mjs'
import { maybeEnqueueRetentionPrune, processRetentionPruneJobs } from '../workers/handlers/retention.mjs'
import { maybeRunImapInboxSync, processImapSyncJobs } from '../workers/handlers/imap-sync.mjs'
import { touchWorkerHeartbeat } from './worker-heartbeat.mjs'
import { reclaimStaleWorkerJobs } from './reclaim-stale-jobs.mjs'

/**
 * @param {import('pg').Pool} pool
 * @param {{ mailBatch?: number, logPrefix?: string, skipSms?: boolean }} [opts]
 */
export async function runGeneralWorkerTick(pool, opts = {}) {
  const mailBatch = opts.mailBatch ?? Number(process.env.MAIL_BATCH_SIZE ?? 20)
  const logPrefix = opts.logPrefix ?? '[worker]'

  const reclaimed = await reclaimStaleWorkerJobs(pool)
  if (reclaimed.length) {
    console.warn(`${logPrefix} reclaimed ${reclaimed.length} stale job(s):`, reclaimed.map(r => `${r.job_type}:${r.status}`).join(', '))
  }

  await touchWorkerHeartbeat(pool, 'general')

  const mail = await drainMailQueue(pool, mailBatch)
  if (mail.processed || mail.failed) {
    console.log(`${logPrefix} email_send processed=${mail.processed} failed=${mail.failed}`)
  }

  // The Nitro app's embedded worker shares the request Postgres pool. Sending
  // Quo SMS from that process is what made messageNotifyChannel=sms look like
  // a login outage (hung api.quo.com held the tick + pool). Dedicated worker
  // (worker.mjs) still processes sms_send.
  if (!opts.skipSms) {
    const smsBatch = opts.mailBatch ?? Number(process.env.SMS_BATCH_SIZE ?? 20)
    const sms = await processSmsJobs(pool, smsBatch)
    if (sms.processed || sms.failed) {
      console.log(`${logPrefix} sms_send processed=${sms.processed} failed=${sms.failed}`)
    }
  }

  const thumbs = await processThumbnailJobs(pool)
  if (thumbs.processed || thumbs.failed) {
    console.log(`${logPrefix} thumbnail_generate processed=${thumbs.processed} failed=${thumbs.failed}`)
  }

  const invoiceSend = await processInvoiceSendJobs(pool)
  if (invoiceSend.processed || invoiceSend.failed) {
    console.log(`${logPrefix} invoice_send processed=${invoiceSend.processed} failed=${invoiceSend.failed}`)
  }

  const ai = await processAiJobs(pool)
  if (ai.processed || ai.failed) {
    console.log(`${logPrefix} ai_jobs processed=${ai.processed} failed=${ai.failed}`)
  }

  const deletionAi = await processDeletionAiReviewJobs(pool)
  if (deletionAi.processed || deletionAi.failed) {
    console.log(
      `${logPrefix} deletion_request_ai_review processed=${deletionAi.processed} failed=${deletionAi.failed}`,
    )
  }
  else if (deletionAi.skipped && process.env.DELETION_AI_REVIEW_VERBOSE === '1') {
    console.warn(`${logPrefix} deletion_request_ai_review skipped — set INTERNAL_WORKER_TOKEN or ENCRYPTION_MASTER_KEY`)
  }

  const scheduled = await maybeEnqueueScheduledBackup(pool)
  if (scheduled) {
    console.log(`${logPrefix} backup_run scheduled job enqueued`)
  }

  const backups = await processBackupJobs(pool)
  if (backups.processed || backups.failed) {
    console.log(`${logPrefix} backup_run processed=${backups.processed} failed=${backups.failed}`)
  }

  const retentionScheduled = await maybeEnqueueRetentionPrune(pool)
  if (retentionScheduled) {
    console.log(`${logPrefix} backup_retention_prune scheduled job enqueued`)
  }

  const retention = await processRetentionPruneJobs(pool)
  if (retention.processed || retention.failed) {
    console.log(`${logPrefix} backup_retention_prune processed=${retention.processed} failed=${retention.failed}`)
  }

  const imapInline = await maybeRunImapInboxSync(pool)
  if (imapInline?.ingested) {
    console.log(`${logPrefix} imap_sync inline ingested=${imapInline.ingested} skipped=${imapInline.skipped}`)
  }

  const imap = await processImapSyncJobs(pool)
  // Quiet no-op sync ticks (common while awaiting PrintMe); log failures or real work.
  if (imap.failed || (imap.processed && imap.ingested)) {
    console.log(
      `${logPrefix} imap_sync processed=${imap.processed} failed=${imap.failed}`
      + (imap.ingested != null ? ` ingested=${imap.ingested}` : ''),
    )
  }
  else if (imap.processed && process.env.IMAP_SYNC_VERBOSE === '1') {
    console.log(`${logPrefix} imap_sync processed=${imap.processed} failed=${imap.failed}`)
  }
}
