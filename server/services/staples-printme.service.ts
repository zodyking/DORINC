import { randomBytes } from 'node:crypto'
import { and, desc, eq, inArray, isNull } from 'drizzle-orm'
import type { Db } from '../db/client'
import { staplesPrintJobs } from '../db/schema'
import { workerJobs } from '../db/schema/jobs'
import { getSmtpConfig } from './app-config.service'
import { renderServiceLogSheetPdf } from './service-log-sheet.service'
import { sendNotificationMail } from '../mail/mailer'
import { enqueueJob } from './jobs.service'
import {
  STAPLES_PRINTME_CODE_TTL_MS,
  STAPLES_PRINTME_LOCATOR_URL,
  STAPLES_PRINTME_TO,
  buildCode128Svg,
  buildPrintMeMailPayload,
} from '../../shared/staples-printme'

export class StaplesPrintMeServiceError extends Error {
  constructor(
    public code: 'SMTP_NOT_CONFIGURED' | 'NOT_FOUND' | 'FORBIDDEN' | 'SEND_FAILED' | 'PDF_FAILED',
    message: string,
  ) {
    super(message)
    this.name = 'StaplesPrintMeServiceError'
  }
}

export interface StaplesPrintJobView {
  id: string
  status: string
  releaseCode: string | null
  errorMessage: string | null
  locatorUrl: string
  emailedAt: string | null
  readyAt: string | null
  expiresAt: string | null
  createdAt: string
  printMeTo: string
  delivered: boolean
  attachmentFilename: string | null
  attachmentBytes: number | null
  hasBarcode: boolean
  awaitingReply: boolean
}

/** Shown on Service Logs until the user requests removal (soft-dismiss). */
const ACTIVE_STATUSES = ['queued', 'emailed', 'awaiting_reply', 'ready', 'expired', 'failed'] as const

function newSubjectToken(): string {
  return randomBytes(5).toString('hex').toUpperCase()
}

function iso(value: Date | null | undefined): string | null {
  return value ? value.toISOString() : null
}

function toView(
  row: typeof staplesPrintJobs.$inferSelect,
  extras: { delivered?: boolean, attachmentFilename?: string | null, attachmentBytes?: number | null } = {},
): StaplesPrintJobView {
  const awaitingReply = row.status === 'queued'
    || row.status === 'emailed'
    || row.status === 'awaiting_reply'
  return {
    id: row.id,
    status: row.status,
    releaseCode: row.releaseCode,
    errorMessage: row.errorMessage,
    locatorUrl: STAPLES_PRINTME_LOCATOR_URL,
    emailedAt: iso(row.emailedAt),
    readyAt: iso(row.readyAt),
    expiresAt: iso(row.expiresAt),
    createdAt: row.createdAt.toISOString(),
    printMeTo: STAPLES_PRINTME_TO,
    delivered: extras.delivered ?? Boolean(row.emailedAt && row.status !== 'failed'),
    attachmentFilename: extras.attachmentFilename ?? 'service-log-sheet.pdf',
    attachmentBytes: extras.attachmentBytes ?? null,
    hasBarcode: Boolean(row.barcodeImage?.length) || Boolean(row.releaseCode),
    awaitingReply,
  }
}

async function maybeExpireJob(db: Db, row: typeof staplesPrintJobs.$inferSelect) {
  if (row.dismissedAt) return row
  if (row.status !== 'ready' || !row.expiresAt) return row
  if (row.expiresAt.getTime() > Date.now()) return row
  const [updated] = await db.update(staplesPrintJobs).set({
    status: 'expired',
    errorMessage: 'PrintMe release codes expire about 24 hours after upload',
    updatedAt: new Date(),
  }).where(eq(staplesPrintJobs.id, row.id)).returning()
  return updated ?? row
}

async function enqueueImapIfIdle(db: Db, payload: Record<string, unknown>) {
  const [active] = await db.select({ id: workerJobs.id })
    .from(workerJobs)
    .where(and(
      eq(workerJobs.jobType, 'imap_sync'),
      inArray(workerJobs.status, ['queued', 'processing']),
    ))
    .limit(1)

  if (active) return false
  await enqueueJob(db, 'imap_sync', payload, 3).catch(() => null)
  return true
}

/** Email the blank service log sheet PDF to Staples PrintMe and await the release-code reply via IMAP. */
export async function startStaplesPrintMeJob(
  db: Db,
  createdBy: string,
): Promise<StaplesPrintJobView> {
  const smtp = getSmtpConfig()
  if (!smtp?.from || !smtp.host) {
    throw new StaplesPrintMeServiceError(
      'SMTP_NOT_CONFIGURED',
      'SMTP must be configured so DORINC can email Staples PrintMe and receive the release code reply',
    )
  }

  let pdf: Buffer
  try {
    pdf = await renderServiceLogSheetPdf(db)
  }
  catch (err) {
    throw new StaplesPrintMeServiceError(
      'PDF_FAILED',
      err instanceof Error ? err.message : 'Could not render the service log sheet PDF',
    )
  }

  const subjectToken = newSubjectToken()
  const payload = buildPrintMeMailPayload({ token: subjectToken, pdf })
  if (!payload.ok || !payload.mail) {
    throw new StaplesPrintMeServiceError(
      'PDF_FAILED',
      payload.reason || 'Could not prepare the PrintMe PDF attachment',
    )
  }

  const now = new Date()
  const [job] = await db.insert(staplesPrintJobs).values({
    createdBy,
    documentType: 'service_log_sheet',
    status: 'queued',
    subjectToken,
    createdAt: now,
    updatedAt: now,
  }).returning()

  if (!job) {
    throw new StaplesPrintMeServiceError('SEND_FAILED', 'Could not create Staples print job')
  }

  const attachment = payload.mail.attachments[0]!

  try {
    const { delivered, messageId } = await sendNotificationMail(db, {
      to: payload.mail.to,
      subject: payload.mail.subject,
      text: payload.mail.text,
      // No HTML on purpose — PrintMe supports HTML as a printable document type.
      debugLabel: 'staples-printme',
      attachments: [{
        filename: attachment.filename,
        content: attachment.content,
        contentType: attachment.contentType,
        contentDisposition: 'attachment',
      }],
    })

    const outboundMessageId = messageId
    const emailedAt = new Date()
    const attachmentBytes = attachment.content.length

    if (!delivered) {
      const [failed] = await db.update(staplesPrintJobs).set({
        status: 'failed',
        errorMessage: 'SMTP did not accept the PrintMe email with the PDF attachment. Check Control Panel → Email / SMTP.',
        outboundMessageId,
        updatedAt: new Date(),
      }).where(eq(staplesPrintJobs.id, job.id)).returning()
      return toView(failed!, {
        delivered: false,
        attachmentFilename: attachment.filename,
        attachmentBytes,
      })
    }

    console.info(
      `[staples-printme] emailed PDF to=${payload.mail.to} bytes=${attachmentBytes} subject="${payload.mail.subject}" messageId=${outboundMessageId}`,
    )

    const [updated] = await db.update(staplesPrintJobs).set({
      status: 'awaiting_reply',
      outboundMessageId,
      emailedAt,
      expiresAt: new Date(emailedAt.getTime() + STAPLES_PRINTME_CODE_TTL_MS),
      errorMessage: null,
      updatedAt: new Date(),
    }).where(eq(staplesPrintJobs.id, job.id)).returning()

    await enqueueImapIfIdle(db, {
      trigger: 'staples_printme',
      jobId: job.id,
    })

    return toView(updated!, {
      delivered: true,
      attachmentFilename: attachment.filename,
      attachmentBytes,
    })
  }
  catch (err) {
    const [failed] = await db.update(staplesPrintJobs).set({
      status: 'failed',
      errorMessage: err instanceof Error ? err.message : 'Failed to email Staples PrintMe',
      updatedAt: new Date(),
    }).where(eq(staplesPrintJobs.id, job.id)).returning()
    if (failed) {
      return toView(failed, {
        delivered: false,
        attachmentFilename: attachment.filename,
        attachmentBytes: attachment.content.length,
      })
    }
    throw new StaplesPrintMeServiceError(
      'SEND_FAILED',
      err instanceof Error ? err.message : 'Failed to email Staples PrintMe',
    )
  }
}

export async function getStaplesPrintMeJob(
  db: Db,
  jobId: string,
  userId: string,
  opts: { allowAdminAll?: boolean } = {},
): Promise<StaplesPrintJobView> {
  const [row] = await db.select().from(staplesPrintJobs).where(eq(staplesPrintJobs.id, jobId)).limit(1)
  if (!row || row.dismissedAt) throw new StaplesPrintMeServiceError('NOT_FOUND', 'Print job not found')
  if (row.createdBy !== userId && !opts.allowAdminAll) {
    throw new StaplesPrintMeServiceError('FORBIDDEN', 'This print job belongs to another user')
  }
  return toView(await maybeExpireJob(db, row))
}

export async function listActiveStaplesPrintMeJobs(
  db: Db,
  userId: string,
  opts: { nudgeImap?: boolean } = {},
): Promise<StaplesPrintJobView[]> {
  const rows = await db.select().from(staplesPrintJobs)
    .where(and(
      eq(staplesPrintJobs.createdBy, userId),
      eq(staplesPrintJobs.documentType, 'service_log_sheet'),
      isNull(staplesPrintJobs.dismissedAt),
      inArray(staplesPrintJobs.status, [...ACTIVE_STATUSES]),
    ))
    .orderBy(desc(staplesPrintJobs.createdAt))
    .limit(20)

  const views: StaplesPrintJobView[] = []
  let awaiting = false
  for (const row of rows) {
    const next = await maybeExpireJob(db, row)
    if (!ACTIVE_STATUSES.includes(next.status as typeof ACTIVE_STATUSES[number])) continue
    if (next.dismissedAt) continue
    const view = toView(next)
    if (view.awaitingReply) awaiting = true
    views.push(view)
  }

  if (opts.nudgeImap && awaiting) {
    await enqueueImapIfIdle(db, { trigger: 'staples_printme_poll' })
  }

  return views
}

export async function getLatestOpenStaplesPrintMeJob(
  db: Db,
  userId: string,
): Promise<StaplesPrintJobView | null> {
  const jobs = await listActiveStaplesPrintMeJobs(db, userId)
  return jobs[0] ?? null
}

/** Soft-remove an active Staples print order from the Service Logs page. */
export async function dismissStaplesPrintMeJob(
  db: Db,
  jobId: string,
  userId: string,
  opts: { allowAdminAll?: boolean } = {},
): Promise<StaplesPrintJobView> {
  const [row] = await db.select().from(staplesPrintJobs).where(eq(staplesPrintJobs.id, jobId)).limit(1)
  if (!row || row.dismissedAt) throw new StaplesPrintMeServiceError('NOT_FOUND', 'Print job not found')
  if (row.createdBy !== userId && !opts.allowAdminAll) {
    throw new StaplesPrintMeServiceError('FORBIDDEN', 'This print job belongs to another user')
  }

  const now = new Date()
  const [updated] = await db.update(staplesPrintJobs).set({
    status: 'dismissed',
    dismissedAt: now,
    updatedAt: now,
  }).where(eq(staplesPrintJobs.id, jobId)).returning()

  return toView(updated!)
}

export async function getStaplesPrintMeBarcode(
  db: Db,
  jobId: string,
  userId: string,
  opts: { allowAdminAll?: boolean } = {},
): Promise<{ contentType: string, body: Buffer | string, filename: string }> {
  const [row] = await db.select().from(staplesPrintJobs).where(eq(staplesPrintJobs.id, jobId)).limit(1)
  if (!row || row.dismissedAt) throw new StaplesPrintMeServiceError('NOT_FOUND', 'Print job not found')
  if (row.createdBy !== userId && !opts.allowAdminAll) {
    throw new StaplesPrintMeServiceError('FORBIDDEN', 'This print job belongs to another user')
  }

  const current = await maybeExpireJob(db, row)
  if (!current.releaseCode) {
    throw new StaplesPrintMeServiceError('NOT_FOUND', 'Release code is not ready yet')
  }

  if (current.barcodeImage?.length) {
    return {
      contentType: current.barcodeContentType || 'image/png',
      body: current.barcodeImage,
      filename: `staples-release-${current.releaseCode}.png`,
    }
  }

  const svg = buildCode128Svg(current.releaseCode)
  return {
    contentType: 'image/svg+xml; charset=utf-8',
    body: svg,
    filename: `staples-release-${current.releaseCode}.svg`,
  }
}
