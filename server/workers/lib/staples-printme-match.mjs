import {
  STAPLES_PRINTME_CODE_TTL_MS,
  extractPrintMeCorrelationToken,
  extractPrintMeReleaseCode,
  isPrintMeSender,
  pickPrintMeBarcodeAttachment,
  replyMatchesPrintMeJob,
} from '../../../shared/staples-printme.mjs'
import { ensureStaplesPrintJobsSchema } from '../../lib/ensure-staples-print-jobs-schema.mjs'
import { notifyStaplesPrintReadyTeamMessage } from '../../lib/print-team-notify.mjs'

/**
 * Match a PrintMe confirmation email to an open staples_print_jobs row and store the release code.
 * @param {import('pg').Pool} pool
 * @param {{
 *   from: string,
 *   subject?: string | null,
 *   text?: string | null,
 *   html?: string | null,
 *   internetMessageId: string,
 *   inReplyTo?: string | null,
 *   references?: string | null,
 *   attachments?: Array<{
 *     filename?: string | null,
 *     contentType?: string | null,
 *     content?: Buffer | Uint8Array | null,
 *     contentDisposition?: string | null,
 *     cid?: string | null,
 *   }> | null,
 * }} input
 */
export async function matchStaplesPrintMeReply(pool, input) {
  if (!isPrintMeSender(input.from)) return { matched: false, reason: 'not_printme' }

  await ensureStaplesPrintJobsSchema(pool)

  const releaseCode = extractPrintMeReleaseCode(input.text, input.html, input.subject)
  if (!releaseCode) {
    console.warn('[staples-printme] PrintMe reply had no parseable release code', input.subject)
    return { matched: false, reason: 'no_code' }
  }

  const barcode = pickPrintMeBarcodeAttachment(input.attachments)

  // PrintMe puts [DORINC-PRINT-…] in the body ("Mail body: …"), not the reply subject.
  const token = extractPrintMeCorrelationToken({
    subject: input.subject,
    text: input.text,
    html: input.html,
  })
  let job = null

  const jobSelect = `id, outbound_message_id, status, created_by, document_type, document_label, entity_id`

  if (token) {
    const { rows } = await pool.query(
      `SELECT ${jobSelect}
       FROM staples_print_jobs
       WHERE subject_token = $1
         AND dismissed_at IS NULL
         AND status IN ('queued', 'emailed', 'awaiting_reply')
       LIMIT 1`,
      [token],
    )
    job = rows[0] ?? null
  }

  if (!job) {
    const { rows } = await pool.query(
      `SELECT ${jobSelect}
       FROM staples_print_jobs
       WHERE dismissed_at IS NULL
         AND status IN ('queued', 'emailed', 'awaiting_reply')
         AND outbound_message_id IS NOT NULL
       ORDER BY created_at DESC
       LIMIT 25`,
    )
    job = rows.find(row => replyMatchesPrintMeJob(row.outbound_message_id, {
      inReplyTo: input.inReplyTo,
      references: input.references,
      subject: input.subject,
    })) ?? null
  }

  // PrintMe often sends a fresh message (no In-Reply-To). If exactly one open job
  // is waiting, attach the confirmation to it.
  if (!job) {
    const { rows } = await pool.query(
      `SELECT ${jobSelect}
       FROM staples_print_jobs
       WHERE dismissed_at IS NULL
         AND status IN ('queued', 'emailed', 'awaiting_reply')
       ORDER BY created_at DESC
       LIMIT 2`,
    )
    if (rows.length === 1) job = rows[0]
  }

  if (!job) {
    console.warn('[staples-printme] PrintMe reply did not match an open job', {
      subject: input.subject,
      token,
      inReplyTo: input.inReplyTo,
    })
    return { matched: false, reason: 'no_job' }
  }

  const now = new Date()
  const expiresAt = new Date(now.getTime() + STAPLES_PRINTME_CODE_TTL_MS)
  await pool.query(
    `UPDATE staples_print_jobs
     SET status = 'ready',
         release_code = $2,
         reply_internet_message_id = $3,
         barcode_image = COALESCE($4, barcode_image),
         barcode_content_type = COALESCE($5, barcode_content_type),
         ready_at = $6,
         expires_at = $7,
         error_message = NULL,
         updated_at = $6
     WHERE id = $1`,
    [
      job.id,
      releaseCode,
      input.internetMessageId,
      barcode?.content ?? null,
      barcode?.contentType ?? null,
      now,
      expiresAt,
    ],
  )

  console.info('[staples-printme] release code captured for job', job.id, {
    releaseCode,
    token,
    hasBarcode: Boolean(barcode),
  })

  try {
    const entityType = job.document_type === 'invoice' || job.document_type === 'invoice_batch'
      ? (job.entity_id ? 'invoice' : null)
      : null
    await notifyStaplesPrintReadyTeamMessage(pool, {
      senderUserId: job.created_by,
      jobId: job.id,
      releaseCode,
      documentLabel: job.document_label,
      entityType,
      entityId: job.entity_id,
    })
  }
  catch (err) {
    console.error('[staples-printme] team notify failed', err)
  }

  return { matched: true, jobId: job.id, releaseCode, hasBarcode: Boolean(barcode), token }
}
