import { and, desc, eq, inArray, sql } from 'drizzle-orm'
import type { Db } from '../db/client'
import { customers } from '../db/schema/customers'
import { workerJobs } from '../db/schema/jobs'
import { formatInvoiceNumber } from '../db/schema/invoices'
import { buildInvoiceSentEmail } from '../mail/customer-email-templates'
import { listContacts } from './customers.service'
import { enqueueJob } from './jobs.service'
import { generateInvoicePdf, InvoicePdfServiceError } from './invoice-pdf.service'
import {
  assertInvoiceSendable,
  getInvoice,
  INVOICE_SENDABLE_STATUSES,
  InvoicesServiceError,
  isInvoiceResendable,
  transitionInvoice,
} from './invoices.service'

export type InvoiceSendServiceErrorCode
  = 'NOT_FOUND'
    | 'INVALID_TRANSITION'
    | 'MANAGER_APPROVAL_REQUIRED'
    | 'NO_RECIPIENT'
    | 'ALREADY_QUEUED'
    | 'PDF_FAILED'
    | 'EMAIL_FAILED'
    | 'NOTIFICATION_DISABLED'

export class InvoiceSendServiceError extends Error {
  constructor(public readonly code: InvoiceSendServiceErrorCode) {
    super(code)
  }
}

export interface InvoiceSendRecipient {
  email: string
  name: string
}

/** Resolve billing email for invoice delivery — not gated on portal access. */
export async function resolveInvoiceSendRecipient(db: Db, customerId: string): Promise<InvoiceSendRecipient | null> {
  const contacts = await listContacts(db, customerId)
  const contact = contacts.find(c => c.isBilling && c.email)
    ?? contacts.find(c => c.isPrimary && c.email)
    ?? contacts.find(c => c.email)

  if (contact?.email) {
    return { email: contact.email, name: contact.name }
  }

  const [customer] = await db
    .select({ displayName: customers.displayName, email: customers.email })
    .from(customers)
    .where(eq(customers.id, customerId))
    .limit(1)

  if (customer?.email) {
    return { email: customer.email, name: customer.displayName }
  }

  const snapshotEmail = contacts[0]?.email
  if (snapshotEmail) {
    return { email: snapshotEmail, name: contacts[0]!.name }
  }

  return null
}

export async function findPendingInvoiceSendJob(db: Db, invoiceId: string) {
  const rows = await db.select().from(workerJobs).where(and(
    eq(workerJobs.jobType, 'invoice_send'),
    inArray(workerJobs.status, ['queued', 'processing']),
    sql`${workerJobs.payload}->>'invoiceId' = ${invoiceId}`,
  )).limit(1)
  return rows[0] ?? null
}

export async function findLatestInvoiceSendJob(db: Db, invoiceId: string) {
  const rows = await db.select().from(workerJobs).where(and(
    eq(workerJobs.jobType, 'invoice_send'),
    sql`${workerJobs.payload}->>'invoiceId' = ${invoiceId}`,
  )).orderBy(desc(workerJobs.createdAt)).limit(1)
  return rows[0] ?? null
}

export async function getInvoiceSendDeliveryStatus(db: Db, invoiceId: string) {
  const job = await findLatestInvoiceSendJob(db, invoiceId)
  if (!job) return null
  return {
    jobId: job.id,
    status: job.status,
    lastError: job.lastError,
    recipientEmail: (job.payload as { recipientEmail?: string }).recipientEmail ?? null,
    updatedAt: job.finishedAt?.toISOString() ?? job.startedAt?.toISOString() ?? job.createdAt.toISOString(),
  }
}

export interface QueueInvoiceSendResult {
  invoice: Awaited<ReturnType<typeof getInvoice>>
  job: typeof workerJobs.$inferSelect
  recipient: InvoiceSendRecipient
  pdfJobId: string | null
  alreadyQueued: boolean
}

/** Optional staff overrides captured from the send-compose UI. */
export interface InvoiceSendOverrides {
  recipientEmail?: string | null
  subject?: string | null
  message?: string | null
}

/** Queue PDF generation + email delivery. Invoice becomes sent after email succeeds. */
export async function queueInvoiceSend(
  db: Db,
  invoiceId: string,
  actorId: string,
  overrides?: InvoiceSendOverrides,
  actorAccountType?: string | null,
): Promise<QueueInvoiceSendResult> {
  const { isNotificationEnabled } = await import('./workspace-settings.service')
  if (!(await isNotificationEnabled(db, 'invoiceEmail'))) {
    throw new InvoiceSendServiceError('NOTIFICATION_DISABLED')
  }

  let invoice
  try {
    invoice = await getInvoice(db, invoiceId)
  }
  catch (err) {
    if (err instanceof InvoicesServiceError && err.code === 'NOT_FOUND') {
      throw new InvoiceSendServiceError('NOT_FOUND')
    }
    throw err
  }

  try {
    await assertInvoiceSendable(db, invoice, actorAccountType)
  }
  catch (err) {
    if (err instanceof InvoicesServiceError) {
      if (err.code === 'NOT_FOUND') throw new InvoiceSendServiceError('NOT_FOUND')
      if (err.code === 'MANAGER_APPROVAL_REQUIRED') throw new InvoiceSendServiceError('MANAGER_APPROVAL_REQUIRED')
      if (err.code === 'INVALID_TRANSITION') throw new InvoiceSendServiceError('INVALID_TRANSITION')
    }
    throw err
  }

  let recipient = await resolveInvoiceSendRecipient(db, invoice.customerId)
  const overrideEmail = overrides?.recipientEmail?.trim()
  if (overrideEmail) {
    const snapshotName = (invoice.customerSnapshot as { displayName?: string } | null)?.displayName
    recipient = { email: overrideEmail, name: recipient?.name ?? snapshotName ?? 'Customer' }
  }
  if (!recipient) {
    throw new InvoiceSendServiceError('NO_RECIPIENT')
  }

  const existing = await findPendingInvoiceSendJob(db, invoiceId)
  if (existing) {
    return {
      invoice,
      job: existing,
      recipient,
      pdfJobId: null,
      alreadyQueued: true,
    }
  }

  let pdfResult
  try {
    pdfResult = await generateInvoicePdf(db, invoiceId, actorId, { allowDraft: true })
  }
  catch (err) {
    if (err instanceof InvoicePdfServiceError) {
      if (err.code === 'NOT_FOUND') throw new InvoiceSendServiceError('NOT_FOUND')
      throw new InvoiceSendServiceError('PDF_FAILED')
    }
    throw err
  }
  const mailPayload = await buildInvoiceSendMail(db, recipient, invoice, `${formatInvoiceNumber(invoice.invoiceNumber)}.pdf`, {
    subject: overrides?.subject ?? null,
    message: overrides?.message ?? null,
  })
  const job = await enqueueJob(db, 'invoice_send', {
    invoiceId,
    actorId,
    recipientEmail: recipient.email,
    recipientName: recipient.name,
    pdfJobId: pdfResult.job?.id ?? null,
    ...mailPayload,
  }, 5)

  return {
    invoice,
    job,
    recipient,
    pdfJobId: pdfResult.job?.id ?? null,
    alreadyQueued: false,
  }
}

/** Data for the send-compose UI: recipient + editable defaults + gating flags. */
export async function getInvoiceSendPreview(db: Db, invoiceId: string) {
  const { isNotificationEnabled } = await import('./workspace-settings.service')
  const { invoiceSendEditableDefaults } = await import('../mail/customer-email-templates')

  let invoice
  try {
    invoice = await getInvoice(db, invoiceId)
  }
  catch (err) {
    if (err instanceof InvoicesServiceError && err.code === 'NOT_FOUND') {
      throw new InvoiceSendServiceError('NOT_FOUND')
    }
    throw err
  }

  const invoiceNumber = formatInvoiceNumber(invoice.invoiceNumber)
  const recipient = invoice.customerId ? await resolveInvoiceSendRecipient(db, invoice.customerId) : null
  const pending = await findPendingInvoiceSendJob(db, invoiceId)
  const defaults = invoiceSendEditableDefaults(invoiceNumber)

  return {
    invoiceId,
    invoiceNumber,
    status: invoice.status,
    total: invoice.total,
    dueDate: invoice.dueDate,
    recipient,
    subject: defaults.subject,
    message: defaults.message,
    notificationEnabled: await isNotificationEnabled(db, 'invoiceEmail'),
    alreadyQueued: !!pending,
    sendable: INVOICE_SENDABLE_STATUSES.includes(invoice.status),
    isResend: isInvoiceResendable(invoice.status),
  }
}

export interface BulkInvoiceSendResult {
  invoiceId: string
  invoiceNumber: string
  queued: boolean
  alreadyQueued: boolean
  alreadySent: boolean
  error: string | null
}

const SEND_ERROR_MESSAGES: Record<InvoiceSendServiceErrorCode, string> = {
  NOT_FOUND: 'Invoice not found',
  INVALID_TRANSITION: 'This invoice cannot be emailed from its current status',
  MANAGER_APPROVAL_REQUIRED: 'Manager approval is required before sending this invoice',
  NO_RECIPIENT: 'No billing email on file',
  ALREADY_QUEUED: 'Already queued for delivery',
  PDF_FAILED: 'PDF generation failed',
  EMAIL_FAILED: 'Email delivery failed',
  NOTIFICATION_DISABLED: 'Invoice emails are disabled in Control Panel',
}

/** Queue multiple invoices belonging to a single customer. Never throws per-invoice; returns a report. */
export async function bulkQueueInvoiceSend(
  db: Db,
  input: { customerId: string, invoiceIds: string[], subject?: string | null, message?: string | null },
  actorId: string,
): Promise<{ results: BulkInvoiceSendResult[], recipient: InvoiceSendRecipient | null }> {
  const recipient = await resolveInvoiceSendRecipient(db, input.customerId)
  const results: BulkInvoiceSendResult[] = []

  for (const invoiceId of input.invoiceIds) {
    let invoiceNumber = ''
    try {
      const invoice = await getInvoice(db, invoiceId)
      invoiceNumber = formatInvoiceNumber(invoice.invoiceNumber)
      if (invoice.customerId !== input.customerId) {
        results.push({ invoiceId, invoiceNumber, queued: false, alreadyQueued: false, alreadySent: false, error: 'Invoice belongs to a different customer' })
        continue
      }
      const alreadySent = isInvoiceResendable(invoice.status)
      const result = await queueInvoiceSend(db, invoiceId, actorId, {
        subject: input.subject ?? null,
        message: input.message ?? null,
      })
      results.push({
        invoiceId,
        invoiceNumber: formatInvoiceNumber(result.invoice.invoiceNumber),
        queued: !result.alreadyQueued,
        alreadyQueued: result.alreadyQueued,
        alreadySent,
        error: null,
      })
    }
    catch (err) {
      const message = err instanceof InvoiceSendServiceError
        ? SEND_ERROR_MESSAGES[err.code]
        : 'Could not queue this invoice'
      results.push({ invoiceId, invoiceNumber, queued: false, alreadyQueued: false, alreadySent: false, error: message })
    }
  }

  return { results, recipient }
}

/** Mark invoice sent after worker confirms SMTP delivery (called from worker handler). */
export async function markInvoiceSentAfterDelivery(db: Db, invoiceId: string, actorId: string) {
  const before = await getInvoice(db, invoiceId)
  if (before.status === 'sent' || before.status === 'paid') {
    return { invoice: before, before, alreadySent: true as const }
  }
  if (!['draft', 'pending_manager_approval'].includes(before.status)) {
    throw new InvoiceSendServiceError('INVALID_TRANSITION')
  }
  const { invoice } = await transitionInvoice(db, invoiceId, 'sent', actorId)
  return { invoice, before, alreadySent: false as const }
}

export async function buildInvoiceSendMail(
  db: Db,
  recipient: InvoiceSendRecipient,
  invoice: Awaited<ReturnType<typeof getInvoice>>,
  pdfFilename: string,
  custom?: { subject?: string | null, message?: string | null },
) {
  const { resolveEmailBrand } = await import('./email-branding.service')
  const brand = await resolveEmailBrand(db)
  const base = buildInvoiceSentEmail({
    recipientName: recipient.name,
    invoiceNumber: formatInvoiceNumber(invoice.invoiceNumber),
    invoiceId: invoice.id,
    dueDate: invoice.dueDate,
    total: invoice.total,
    brand,
    customSubject: custom?.subject ?? null,
    customMessage: custom?.message ?? null,
  })
  return {
    ...base,
    attachmentFilename: pdfFilename,
    invoiceId: invoice.id,
    customerId: invoice.customerId,
  }
}
