import { randomBytes } from 'node:crypto'
import { and, desc, eq, inArray, isNull, sql } from 'drizzle-orm'
import type { Db } from '../db/client'
import { staplesPrintJobs, type StaplesPrintDocumentType } from '../db/schema'
import { users } from '../db/schema/auth'
import { imapSyncState } from '../db/schema/email-inbox'
import { workerJobs } from '../db/schema/jobs'
import { getSmtpConfig } from './app-config.service'
import { previewInvoicePdf, InvoicePdfServiceError } from './invoice-pdf.service'
import { renderServiceLogSheetPdf } from './service-log-sheet.service'
import { sendNotificationMail } from '../mail/mailer'
import { enqueueJob } from './jobs.service'
import {
  STAPLES_PRINTME_CODE_TTL_MS,
  STAPLES_PRINTME_IMAP_POLL_MS,
  STAPLES_PRINTME_INVOICE_SUBJECT_PREFIX,
  STAPLES_PRINTME_LOCATOR_URL,
  STAPLES_PRINTME_SUBJECT_PREFIX,
  STAPLES_PRINTME_TO,
  buildCode128Svg,
  buildPrintMeMailPayload,
} from '../../shared/staples-printme'
import { deleteStaplesPrintMeReplyFromInbox } from './staples-printme-imap-delete.service'

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
  documentType: string
  documentLabel: string | null
  entityId: string | null
  releaseCode: string | null
  errorMessage: string | null
  locatorUrl: string
  emailedAt: string | null
  readyAt: string | null
  expiresAt: string | null
  createdAt: string
  createdBy: string | null
  createdByName: string | null
  printMeTo: string
  delivered: boolean
  attachmentFilename: string | null
  attachmentBytes: number | null
  hasBarcode: boolean
  hasPdf: boolean
  awaitingReply: boolean
}

export interface StartStaplesPrintMeOptions {
  documentType?: StaplesPrintDocumentType
  entityId?: string | null
  /** Pre-rendered PDF (e.g. merged invoice batch). */
  pdfOverride?: Buffer | null
  documentLabel?: string | null
  filename?: string | null
  subjectPrefix?: string | null
}

/** Shown until the user requests removal (soft-dismiss). */
const ACTIVE_STATUSES = ['queued', 'emailed', 'awaiting_reply', 'ready', 'expired', 'failed'] as const

function newSubjectToken(): string {
  return randomBytes(5).toString('hex').toUpperCase()
}

function iso(value: Date | null | undefined): string | null {
  return value ? value.toISOString() : null
}

function canPreviewPdf(row: {
  documentType: string
  entityId?: string | null
  pdfData?: Buffer | null
  hasPdfStored?: boolean
}): boolean {
  if (row.hasPdfStored || (row.pdfData?.length ?? 0) > 0) return true
  if (row.documentType === 'service_log_sheet') return true
  if (row.documentType === 'invoice' && row.entityId) return true
  if (row.documentType === 'invoice_batch') return Boolean(row.hasPdfStored || (row.pdfData?.length ?? 0) > 0)
  return false
}

function toView(
  row: typeof staplesPrintJobs.$inferSelect & { hasPdfStored?: boolean, createdByName?: string | null },
  extras: {
    delivered?: boolean
    attachmentFilename?: string | null
    attachmentBytes?: number | null
    createdByName?: string | null
  } = {},
): StaplesPrintJobView {
  const awaitingReply = row.status === 'queued'
    || row.status === 'emailed'
    || row.status === 'awaiting_reply'
  const defaultFilename = row.documentType === 'invoice' || row.documentType === 'invoice_batch'
    ? 'invoice.pdf'
    : 'service-log-sheet.pdf'
  const pdfBytes = row.pdfData?.length ?? null
  return {
    id: row.id,
    status: row.status,
    documentType: row.documentType,
    documentLabel: row.documentLabel,
    entityId: row.entityId,
    releaseCode: row.releaseCode,
    errorMessage: row.errorMessage,
    locatorUrl: STAPLES_PRINTME_LOCATOR_URL,
    emailedAt: iso(row.emailedAt),
    readyAt: iso(row.readyAt),
    expiresAt: iso(row.expiresAt),
    createdAt: row.createdAt.toISOString(),
    createdBy: row.createdBy,
    createdByName: extras.createdByName ?? row.createdByName ?? null,
    printMeTo: STAPLES_PRINTME_TO,
    delivered: extras.delivered ?? Boolean(row.emailedAt && row.status !== 'failed'),
    attachmentFilename: extras.attachmentFilename ?? row.pdfFilename ?? defaultFilename,
    attachmentBytes: extras.attachmentBytes ?? pdfBytes,
    hasBarcode: Boolean(row.barcodeImage?.length) || Boolean(row.releaseCode),
    // Preview when stored, or when we can regenerate the same document type.
    hasPdf: canPreviewPdf(row),
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

/**
 * Queue an IMAP sync when idle. Non-force nudges respect the ~5s PrintMe
 * cadence via imap_sync_state.last_sync_at so the worker is not flooded.
 */
async function enqueueImapIfIdle(
  db: Db,
  payload: Record<string, unknown>,
  opts: { force?: boolean, minIntervalMs?: number } = {},
) {
  const [active] = await db.select({ id: workerJobs.id })
    .from(workerJobs)
    .where(and(
      eq(workerJobs.jobType, 'imap_sync'),
      inArray(workerJobs.status, ['queued', 'processing']),
    ))
    .limit(1)

  if (active) return false

  if (!opts.force) {
    const minIntervalMs = opts.minIntervalMs ?? STAPLES_PRINTME_IMAP_POLL_MS
    const [state] = await db.select({ lastSyncAt: imapSyncState.lastSyncAt })
      .from(imapSyncState)
      .where(eq(imapSyncState.id, 'default'))
      .limit(1)
    if (state?.lastSyncAt) {
      const elapsed = Date.now() - state.lastSyncAt.getTime()
      if (elapsed < minIntervalMs) return false
    }
  }

  await enqueueJob(db, 'imap_sync', payload, 3).catch(() => null)
  return true
}

async function renderPrintPdf(
  db: Db,
  documentType: StaplesPrintDocumentType,
  entityId?: string | null,
): Promise<{ pdf: Buffer, filename: string, documentLabel: string, subjectPrefix: string }> {
  if (documentType === 'invoice') {
    if (!entityId) {
      throw new StaplesPrintMeServiceError('PDF_FAILED', 'Invoice id is required for Staples invoice print')
    }
    try {
      const preview = await previewInvoicePdf(db, entityId)
      return {
        pdf: preview.pdf,
        filename: preview.filename,
        documentLabel: `Invoice ${preview.invoiceNumberFormatted}`,
        subjectPrefix: STAPLES_PRINTME_INVOICE_SUBJECT_PREFIX,
      }
    }
    catch (err) {
      if (err instanceof InvoicePdfServiceError && err.code === 'NOT_FOUND') {
        throw new StaplesPrintMeServiceError('NOT_FOUND', 'Invoice not found')
      }
      throw new StaplesPrintMeServiceError(
        'PDF_FAILED',
        err instanceof Error ? err.message : 'Could not render the invoice PDF',
      )
    }
  }

  try {
    const pdf = await renderServiceLogSheetPdf(db)
    return {
      pdf,
      filename: 'service-log-sheet.pdf',
      documentLabel: 'Blank service log sheet',
      subjectPrefix: STAPLES_PRINTME_SUBJECT_PREFIX,
    }
  }
  catch (err) {
    throw new StaplesPrintMeServiceError(
      'PDF_FAILED',
      err instanceof Error ? err.message : 'Could not render the service log sheet PDF',
    )
  }
}

/** Email a PDF to Staples PrintMe and await the release-code reply via IMAP. */
export async function startStaplesPrintMeJob(
  db: Db,
  createdBy: string,
  opts: StartStaplesPrintMeOptions = {},
): Promise<StaplesPrintJobView> {
  const documentType: StaplesPrintDocumentType = opts.documentType ?? 'service_log_sheet'
  const entityId = opts.entityId ?? null

  const smtp = getSmtpConfig()
  if (!smtp?.from || !smtp.host) {
    throw new StaplesPrintMeServiceError(
      'SMTP_NOT_CONFIGURED',
      'SMTP must be configured so DORINC can email Staples PrintMe and receive the release code reply',
    )
  }

  const rendered = opts.pdfOverride?.length
    ? {
        pdf: opts.pdfOverride,
        filename: opts.filename || (documentType === 'invoice_batch' ? 'invoices.pdf' : 'document.pdf'),
        documentLabel: opts.documentLabel || (documentType === 'invoice_batch' ? 'Invoices' : 'Document'),
        subjectPrefix: opts.subjectPrefix
          || (documentType === 'invoice_batch' || documentType === 'invoice'
            ? STAPLES_PRINTME_INVOICE_SUBJECT_PREFIX
            : STAPLES_PRINTME_SUBJECT_PREFIX),
      }
    : await renderPrintPdf(db, documentType, entityId)
  const subjectToken = newSubjectToken()
  const payload = buildPrintMeMailPayload({
    token: subjectToken,
    pdf: rendered.pdf,
    filename: rendered.filename,
    subjectPrefix: rendered.subjectPrefix,
    documentLabel: `${rendered.documentLabel} PDF`,
  })
  if (!payload.ok || !payload.mail) {
    throw new StaplesPrintMeServiceError(
      'PDF_FAILED',
      payload.reason || 'Could not prepare the PrintMe PDF attachment',
    )
  }

  const now = new Date()
  const [job] = await db.insert(staplesPrintJobs).values({
    createdBy,
    documentType,
    documentLabel: rendered.documentLabel,
    entityId,
    status: 'queued',
    subjectToken,
    pdfData: rendered.pdf,
    pdfFilename: rendered.filename,
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
      `[staples-printme] emailed PDF to=${payload.mail.to} bytes=${attachmentBytes} type=${documentType} subject="${payload.mail.subject}" messageId=${outboundMessageId}`,
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
    }, { force: true })

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
  opts: { nudgeImap?: boolean, allUsers?: boolean } = {},
): Promise<StaplesPrintJobView[]> {
  const filters = [
    isNull(staplesPrintJobs.dismissedAt),
    inArray(staplesPrintJobs.status, [...ACTIVE_STATUSES]),
  ]
  if (!opts.allUsers) filters.unshift(eq(staplesPrintJobs.createdBy, userId))

  // Avoid selecting pdf_data / barcode_image bytea on the list path.
  const rows = await db.select({
    id: staplesPrintJobs.id,
    createdBy: staplesPrintJobs.createdBy,
    createdByName: users.name,
    documentType: staplesPrintJobs.documentType,
    documentLabel: staplesPrintJobs.documentLabel,
    entityId: staplesPrintJobs.entityId,
    status: staplesPrintJobs.status,
    subjectToken: staplesPrintJobs.subjectToken,
    outboundMessageId: staplesPrintJobs.outboundMessageId,
    releaseCode: staplesPrintJobs.releaseCode,
    replyInternetMessageId: staplesPrintJobs.replyInternetMessageId,
    barcodeContentType: staplesPrintJobs.barcodeContentType,
    pdfFilename: staplesPrintJobs.pdfFilename,
    errorMessage: staplesPrintJobs.errorMessage,
    emailedAt: staplesPrintJobs.emailedAt,
    readyAt: staplesPrintJobs.readyAt,
    expiresAt: staplesPrintJobs.expiresAt,
    dismissedAt: staplesPrintJobs.dismissedAt,
    createdAt: staplesPrintJobs.createdAt,
    updatedAt: staplesPrintJobs.updatedAt,
    hasPdfStored: sql<boolean>`(${staplesPrintJobs.pdfData} is not null)`.mapWith(Boolean),
    hasBarcodeStored: sql<boolean>`(${staplesPrintJobs.barcodeImage} is not null)`.mapWith(Boolean),
  }).from(staplesPrintJobs)
    .leftJoin(users, eq(staplesPrintJobs.createdBy, users.id))
    .where(and(...filters))
    .orderBy(desc(staplesPrintJobs.createdAt))
    .limit(40)

  const views: StaplesPrintJobView[] = []
  let awaiting = false
  for (const row of rows) {
    const asSelect = {
      ...row,
      barcodeImage: row.hasBarcodeStored ? Buffer.from([1]) : null,
      pdfData: row.hasPdfStored ? Buffer.from([1]) : null,
    } as typeof staplesPrintJobs.$inferSelect & { hasPdfStored: boolean, createdByName?: string | null }
    const next = await maybeExpireJob(db, asSelect)
    if (!ACTIVE_STATUSES.includes(next.status as typeof ACTIVE_STATUSES[number])) continue
    if (next.dismissedAt) continue
    const view = toView(
      { ...next, hasPdfStored: row.hasPdfStored, createdByName: row.createdByName },
      { createdByName: row.createdByName },
    )
    if (view.awaitingReply) awaiting = true
    views.push(view)
  }

  if (opts.nudgeImap && awaiting) {
    await enqueueImapIfIdle(db, { trigger: 'staples_printme_poll' }, {
      minIntervalMs: STAPLES_PRINTME_IMAP_POLL_MS,
    })
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

/** Soft-remove an active Staples print order from the Staples page. */
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

  // Remove the PrintMe confirmation from the IMAP inbox when we know its Message-ID.
  // Best-effort — dismiss still succeeds if IMAP delete fails.
  const replyId = updated?.replyInternetMessageId ?? row.replyInternetMessageId
  if (replyId) {
    await deleteStaplesPrintMeReplyFromInbox(db, replyId)
  }

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

export async function getStaplesPrintMePdf(
  db: Db,
  jobId: string,
  userId: string,
  opts: { allowAdminAll?: boolean } = {},
): Promise<{ contentType: string, body: Buffer, filename: string }> {
  const [row] = await db.select().from(staplesPrintJobs).where(eq(staplesPrintJobs.id, jobId)).limit(1)
  if (!row || row.dismissedAt) throw new StaplesPrintMeServiceError('NOT_FOUND', 'Print job not found')
  if (row.createdBy !== userId && !opts.allowAdminAll) {
    throw new StaplesPrintMeServiceError('FORBIDDEN', 'This print job belongs to another user')
  }

  if (row.pdfData?.length) {
    return {
      contentType: 'application/pdf',
      body: row.pdfData,
      filename: row.pdfFilename || (row.documentType === 'invoice' ? 'invoice.pdf' : 'service-log-sheet.pdf'),
    }
  }

  // Older jobs (pre pdf_data column) — regenerate and backfill for preview.
  const rendered = await renderPrintPdf(
    db,
    row.documentType as StaplesPrintDocumentType,
    row.entityId,
  )
  await db.update(staplesPrintJobs).set({
    pdfData: rendered.pdf,
    pdfFilename: rendered.filename,
    documentLabel: row.documentLabel || rendered.documentLabel,
    updatedAt: new Date(),
  }).where(eq(staplesPrintJobs.id, row.id))

  return {
    contentType: 'application/pdf',
    body: rendered.pdf,
    filename: rendered.filename,
  }
}
