import {
  STAPLES_PRINTME_CODE_TTL_MS,
  extractPrintMeReleaseCode,
  extractPrintMeSubjectToken,
  isPrintMeSender,
  pickPrintMeBarcodeAttachment,
  replyMatchesPrintMeJob,
} from '../../../shared/staples-printme.mjs'
import { ensureStaplesPrintJobsSchema } from '../../lib/ensure-staples-print-jobs-schema.mjs'

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

  const releaseCode = extractPrintMeReleaseCode(input.text, input.html)
  if (!releaseCode) {
    console.warn('[staples-printme] PrintMe reply had no parseable release code', input.subject)
    return { matched: false, reason: 'no_code' }
  }

  const barcode = pickPrintMeBarcodeAttachment(input.attachments)

  const token = extractPrintMeSubjectToken(input.subject)
  let job = null

  if (token) {
    const { rows } = await pool.query(
      `SELECT id, outbound_message_id, status
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
      `SELECT id, outbound_message_id, status
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

  if (!job) {
    console.warn('[staples-printme] PrintMe reply did not match an open job', {
      subject: input.subject,
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
    hasBarcode: Boolean(barcode),
  })
  return { matched: true, jobId: job.id, releaseCode, hasBarcode: Boolean(barcode) }
}
