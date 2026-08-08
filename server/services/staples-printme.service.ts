import { randomBytes } from 'node:crypto'
import { and, desc, eq } from 'drizzle-orm'
import type { Db } from '../db/client'
import { staplesPrintJobs } from '../db/schema'
import { getSmtpConfig } from './app-config.service'
import { renderServiceLogSheetPdf } from './service-log-sheet.service'
import { sendNotificationMail } from '../mail/mailer'
import { enqueueJob } from './jobs.service'
import {
  STAPLES_PRINTME_CODE_TTL_MS,
  STAPLES_PRINTME_LOCATOR_URL,
  STAPLES_PRINTME_TO,
  buildPrintMeSubject,
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
  qrDataUrl: string | null
  errorMessage: string | null
  locatorUrl: string
  emailedAt: string | null
  readyAt: string | null
  expiresAt: string | null
  createdAt: string
  printMeTo: string
}

function newSubjectToken(): string {
  return randomBytes(5).toString('hex').toUpperCase()
}

function iso(value: Date | null | undefined): string | null {
  return value ? value.toISOString() : null
}

async function buildReleaseCodeQrDataUrl(code: string): Promise<string | null> {
  try {
    const QRCode = (await import('qrcode')).default
    return await QRCode.toDataURL(code, {
      width: 240,
      margin: 2,
      color: { dark: '#0f172a', light: '#ffffff' },
    })
  }
  catch {
    return null
  }
}

async function toView(row: typeof staplesPrintJobs.$inferSelect): Promise<StaplesPrintJobView> {
  const releaseCode = row.releaseCode
  return {
    id: row.id,
    status: row.status,
    releaseCode,
    qrDataUrl: releaseCode ? await buildReleaseCodeQrDataUrl(releaseCode) : null,
    errorMessage: row.errorMessage,
    locatorUrl: STAPLES_PRINTME_LOCATOR_URL,
    emailedAt: iso(row.emailedAt),
    readyAt: iso(row.readyAt),
    expiresAt: iso(row.expiresAt),
    createdAt: row.createdAt.toISOString(),
    printMeTo: STAPLES_PRINTME_TO,
  }
}

async function maybeExpireJob(db: Db, row: typeof staplesPrintJobs.$inferSelect) {
  if (row.status !== 'ready' || !row.expiresAt) return row
  if (row.expiresAt.getTime() > Date.now()) return row
  const [updated] = await db.update(staplesPrintJobs).set({
    status: 'expired',
    errorMessage: 'PrintMe release codes expire about 24 hours after upload',
    updatedAt: new Date(),
  }).where(eq(staplesPrintJobs.id, row.id)).returning()
  return updated ?? row
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
  const subject = buildPrintMeSubject(subjectToken)
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

  try {
    const { delivered, messageId } = await sendNotificationMail(db, {
      to: STAPLES_PRINTME_TO,
      subject,
      text: [
        'Please accept this service log sheet PDF for Staples PrintMe cloud printing.',
        '',
        `Correlation: DORINC-PRINT-${subjectToken}`,
        'Reply with the release code as usual.',
      ].join('\n'),
      html: [
        '<p>Please accept this <b>service log sheet</b> PDF for Staples PrintMe cloud printing.</p>',
        `<p>Correlation: <code>DORINC-PRINT-${subjectToken}</code></p>`,
        '<p>Reply with the release code as usual.</p>',
      ].join(''),
      debugLabel: 'staples-printme',
      attachments: [{
        filename: 'service-log-sheet.pdf',
        content: pdf,
        contentType: 'application/pdf',
      }],
    })

    const outboundMessageId = messageId
    const emailedAt = new Date()

    if (!delivered && process.env.NODE_ENV === 'production') {
      const [failed] = await db.update(staplesPrintJobs).set({
        status: 'failed',
        errorMessage: 'SMTP did not accept the PrintMe email',
        outboundMessageId,
        updatedAt: new Date(),
      }).where(eq(staplesPrintJobs.id, job.id)).returning()
      return toView(failed!)
    }

    const [updated] = await db.update(staplesPrintJobs).set({
      status: 'awaiting_reply',
      outboundMessageId,
      emailedAt,
      // Soft expiry window even before reply (PrintMe docs: ~24h from upload).
      expiresAt: new Date(emailedAt.getTime() + STAPLES_PRINTME_CODE_TTL_MS),
      errorMessage: delivered
        ? null
        : 'Email queued in development without SMTP — waiting for a PrintMe reply if IMAP is connected',
      updatedAt: new Date(),
    }).where(eq(staplesPrintJobs.id, job.id)).returning()

    // Nudge IMAP so the release-code reply is picked up quickly.
    await enqueueJob(db, 'imap_sync', {
      trigger: 'staples_printme',
      jobId: job.id,
    }, 3).catch(() => null)

    return toView(updated!)
  }
  catch (err) {
    const [failed] = await db.update(staplesPrintJobs).set({
      status: 'failed',
      errorMessage: err instanceof Error ? err.message : 'Failed to email Staples PrintMe',
      updatedAt: new Date(),
    }).where(eq(staplesPrintJobs.id, job.id)).returning()
    if (failed) return toView(failed)
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
  if (!row) throw new StaplesPrintMeServiceError('NOT_FOUND', 'Print job not found')
  if (row.createdBy !== userId && !opts.allowAdminAll) {
    throw new StaplesPrintMeServiceError('FORBIDDEN', 'This print job belongs to another user')
  }
  return toView(await maybeExpireJob(db, row))
}

export async function getLatestOpenStaplesPrintMeJob(
  db: Db,
  userId: string,
): Promise<StaplesPrintJobView | null> {
  const [row] = await db.select().from(staplesPrintJobs)
    .where(and(
      eq(staplesPrintJobs.createdBy, userId),
      eq(staplesPrintJobs.documentType, 'service_log_sheet'),
    ))
    .orderBy(desc(staplesPrintJobs.createdAt))
    .limit(1)
  if (!row) return null
  if (!['queued', 'emailed', 'awaiting_reply', 'ready'].includes(row.status)) return null
  return toView(await maybeExpireJob(db, row))
}
