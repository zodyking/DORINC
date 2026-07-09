import { and, desc, eq, inArray, sql } from 'drizzle-orm'
import type { Db } from '../db/client'
import { customers } from '../db/schema/customers'
import { workerJobs } from '../db/schema/jobs'
import { formatInvoiceNumber } from '../db/schema/invoices'
import { buildInvoiceSentEmail } from '../mail/customer-email-templates'
import { listContacts } from './customers.service'
import { enqueueJob } from './jobs.service'
import { generateInvoicePdf } from './invoice-pdf.service'
import {
  getInvoice,
  InvoicesServiceError,
  transitionInvoice,
} from './invoices.service'

export type InvoiceSendServiceErrorCode
  = 'NOT_FOUND'
    | 'INVALID_TRANSITION'
    | 'NO_RECIPIENT'
    | 'ALREADY_QUEUED'
    | 'PDF_FAILED'
    | 'EMAIL_FAILED'

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

/** Queue PDF generation + email delivery. Invoice stays approved until email succeeds. */
export async function queueInvoiceSend(db: Db, invoiceId: string, actorId: string): Promise<QueueInvoiceSendResult> {
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

  if (invoice.status !== 'approved') {
    throw new InvoiceSendServiceError('INVALID_TRANSITION')
  }

  const recipient = await resolveInvoiceSendRecipient(db, invoice.customerId)
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

  const pdfResult = await generateInvoicePdf(db, invoiceId, actorId)
  const job = await enqueueJob(db, 'invoice_send', {
    invoiceId,
    actorId,
    recipientEmail: recipient.email,
    recipientName: recipient.name,
    pdfJobId: pdfResult.job?.id ?? null,
    ...buildInvoiceSendMail(recipient, invoice, `${formatInvoiceNumber(invoice.invoiceNumber)}.pdf`),
  }, 5)

  return {
    invoice,
    job,
    recipient,
    pdfJobId: pdfResult.job?.id ?? null,
    alreadyQueued: false,
  }
}

/** Mark invoice sent after worker confirms SMTP delivery (called from worker handler). */
export async function markInvoiceSentAfterDelivery(db: Db, invoiceId: string, actorId: string) {
  const before = await getInvoice(db, invoiceId)
  if (before.status === 'sent' || before.status === 'paid') {
    return { invoice: before, before, alreadySent: true as const }
  }
  if (before.status !== 'approved') {
    throw new InvoiceSendServiceError('INVALID_TRANSITION')
  }
  const { invoice } = await transitionInvoice(db, invoiceId, 'sent', actorId)
  return { invoice, before, alreadySent: false as const }
}

export function buildInvoiceSendMail(
  recipient: InvoiceSendRecipient,
  invoice: Awaited<ReturnType<typeof getInvoice>>,
  pdfFilename: string,
) {
  const base = buildInvoiceSentEmail({
    recipientName: recipient.name,
    invoiceNumber: formatInvoiceNumber(invoice.invoiceNumber),
    invoiceId: invoice.id,
    dueDate: invoice.dueDate,
    total: invoice.total,
  })
  return {
    ...base,
    attachmentFilename: pdfFilename,
    invoiceId: invoice.id,
    customerId: invoice.customerId,
  }
}
