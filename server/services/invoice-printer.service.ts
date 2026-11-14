import { eq } from 'drizzle-orm'
import type { Db } from '../db/client'
import { users } from '../db/schema'
import { formatInvoiceNumber } from '../db/schema/invoices'
import { sendNotificationMail } from '../mail/mailer'
import {
  isValidPrinterEmail,
  normalizePrinterEmail,
  shouldAttachBlankServiceLog,
} from '../../shared/invoice-printer'
import { QUEUE_RE } from '../../shared/printers'
import { printTargets } from './printers'
import { sendAppDocument } from './printers/send-document'
import { PrintError } from './printers/errors'
import { resolveInvoicePdfForDisplay, InvoicePdfServiceError } from './invoice-pdf.service'
import { getInvoice, InvoicesServiceError } from './invoices.service'
import { renderServiceLogSheetPdf } from './service-log-sheet.service'
import {
  getInvoicePrinterCount,
  getInvoiceWorkspaceSettings,
  incrementInvoicePrinterCount,
} from './workspace-settings.service'
import { writeAudit } from './audit.service'

export type InvoicePrinterErrorCode
  = 'NOT_CONFIGURED'
    | 'NOT_FOUND'
    | 'PDF_FAILED'
    | 'SEND_FAILED'

export class InvoicePrinterServiceError extends Error {
  constructor(public readonly code: InvoicePrinterErrorCode, message?: string) {
    super(message ?? code)
    this.name = 'InvoicePrinterServiceError'
  }
}

export type InvoicePrinterAttachmentKind = 'invoice' | 'service_log'

export interface InvoicePrinterSendResult {
  /** 'shop' went straight to a registered printer. 'email' used the printer's email address. */
  destination: 'shop' | 'email'
  printerEmail: string
  /** Shop printer name, or the printer email address. */
  printerLabel: string
  delivered: boolean
  attachments: InvoicePrinterAttachmentKind[]
  invoiceId: string | null
  invoiceNumber: string | null
  includedServiceLog: boolean
}

export interface PrintInvoiceToPrinterOptions {
  /** When 'auto', follow workspace cadence. When true/false, honor the explicit choice. */
  includeServiceLog?: boolean | 'auto'
  source?: 'auto_send' | 'susan'
}

function printerNotConfiguredMessage(): string {
  return 'Shop printer email is not set. Add it in Control Panel → Invoices → Print when sent.'
}

function shopPrinterNotReadyMessage(): string {
  return 'The shop printer chosen for auto print is not ready. Choose it again in Control Panel → Invoices → Print when sent.'
}

async function actorName(db: Db, actorId: string): Promise<string> {
  const [row] = await db.select({ name: users.name }).from(users).where(eq(users.id, actorId)).limit(1)
  return row?.name?.trim() || 'Auto print'
}

type PrintDestination
  = { kind: 'email', email: string }
    | { kind: 'shop', queue: string, label: string }

async function resolveDestination(db: Db): Promise<PrintDestination> {
  const settings = await getInvoiceWorkspaceSettings(db)
  if (settings.autoPrintDestination === 'shop') {
    const queue = settings.autoPrintQueue.trim()
    if (!QUEUE_RE.test(queue)) {
      throw new InvoicePrinterServiceError('NOT_CONFIGURED', 'Choose a shop printer in Control Panel → Invoices → Print when sent.')
    }
    const target = (await printTargets()).find(item => item.queue === queue)
    if (!target) throw new InvoicePrinterServiceError('NOT_CONFIGURED', shopPrinterNotReadyMessage())
    return { kind: 'shop', queue, label: target.label }
  }
  const email = normalizePrinterEmail(settings.printerEmail)
  if (!isValidPrinterEmail(email)) {
    throw new InvoicePrinterServiceError('NOT_CONFIGURED', printerNotConfiguredMessage())
  }
  return { kind: 'email', email }
}

async function deliverToShop(
  db: Db,
  actorId: string,
  queue: string,
  kind: 'invoice' | 'service-log-sheet',
  invoiceIds?: string[],
) {
  try {
    await sendAppDocument(db, {
      kind,
      queue,
      ...(invoiceIds ? { invoiceIds } : {}),
      actorUserId: actorId,
      actorName: await actorName(db, actorId),
    })
  }
  catch (err) {
    if (err instanceof PrintError) throw new InvoicePrinterServiceError('SEND_FAILED', err.message)
    throw err
  }
}

async function serviceLogAttachment(db: Db) {
  try {
    const pdf = await renderServiceLogSheetPdf(db)
    return {
      filename: 'blank-service-log.pdf',
      content: pdf,
      contentType: 'application/pdf',
      contentDisposition: 'attachment' as const,
    }
  }
  catch (err) {
    throw new InvoicePrinterServiceError(
      'PDF_FAILED',
      err instanceof Error ? err.message : 'Could not render the blank service log',
    )
  }
}

async function deliverPrinterEmail(
  db: Db,
  input: {
    printerEmail: string
    subject: string
    text: string
    attachments: Array<{
      filename: string
      content: Buffer
      contentType?: string
      contentDisposition?: 'inline' | 'attachment'
    }>
  },
): Promise<boolean> {
  try {
    const { delivered } = await sendNotificationMail(db, {
      to: input.printerEmail,
      subject: input.subject,
      text: input.text,
      debugLabel: 'invoice-printer',
      attachments: input.attachments,
    })
    return delivered
  }
  catch (err) {
    throw new InvoicePrinterServiceError(
      'SEND_FAILED',
      err instanceof Error ? err.message : 'Printer email failed',
    )
  }
}

export async function printBlankServiceLogToPrinter(
  db: Db,
  actorId: string,
  source: 'auto_send' | 'susan' = 'susan',
): Promise<InvoicePrinterSendResult> {
  const destination = await resolveDestination(db)
  let delivered = true
  if (destination.kind === 'shop') {
    await deliverToShop(db, actorId, destination.queue, 'service-log-sheet')
  }
  else {
    const attachment = await serviceLogAttachment(db)
    delivered = await deliverPrinterEmail(db, {
      printerEmail: destination.email,
      subject: 'Blank service log',
      text: 'Blank service log sheet for the shop printer.',
      attachments: [attachment],
    })
  }
  const printerLabel = destination.kind === 'shop' ? destination.label : destination.email
  const printerEmail = destination.kind === 'email' ? destination.email : ''

  await writeAudit(null, {
    entityType: 'system',
    action: 'invoices.printer_print',
    permissionKey: 'invoices.send.all',
    riskLevel: 'normal',
    afterData: {
      via: source,
      actorId,
      destination: destination.kind,
      printerLabel,
      attachments: ['service_log'],
    },
  }).catch(() => undefined)

  return {
    destination: destination.kind,
    printerEmail,
    printerLabel,
    delivered,
    attachments: ['service_log'],
    invoiceId: null,
    invoiceNumber: null,
    includedServiceLog: true,
  }
}

export async function printInvoiceToPrinter(
  db: Db,
  invoiceId: string,
  actorId: string,
  options: PrintInvoiceToPrinterOptions = {},
): Promise<InvoicePrinterSendResult> {
  const destination = await resolveDestination(db)
  const settings = await getInvoiceWorkspaceSettings(db)

  let invoice
  try {
    invoice = await getInvoice(db, invoiceId)
  }
  catch (err) {
    if (err instanceof InvoicesServiceError && err.code === 'NOT_FOUND') {
      throw new InvoicePrinterServiceError('NOT_FOUND')
    }
    throw err
  }

  const invoiceNumber = formatInvoiceNumber(invoice.invoiceNumber)
  let includedServiceLog = false
  const includeMode = options.includeServiceLog ?? false
  if (includeMode === true) includedServiceLog = true
  else if (includeMode === 'auto' && settings.printBlankServiceLogAfterInvoice) {
    const nextCount = (await getInvoicePrinterCount(db)) + 1
    includedServiceLog = shouldAttachBlankServiceLog(nextCount, settings.blankServiceLogEveryNInvoices)
  }
  const kinds: InvoicePrinterAttachmentKind[] = includedServiceLog ? ['invoice', 'service_log'] : ['invoice']

  const subject = includedServiceLog
    ? `${invoiceNumber} + service log`
    : invoiceNumber
  const text = includedServiceLog
    ? `${invoiceNumber} and a blank service log for the shop printer.`
    : `${invoiceNumber} for the shop printer.`

  let delivered = true
  if (destination.kind === 'shop') {
    await deliverToShop(db, actorId, destination.queue, 'invoice', [invoiceId])
    if (includedServiceLog) await deliverToShop(db, actorId, destination.queue, 'service-log-sheet')
  }
  else {
    let invoicePdf
    try {
      invoicePdf = await resolveInvoicePdfForDisplay(db, invoiceId)
    }
    catch (err) {
      if (err instanceof InvoicePdfServiceError && err.code === 'NOT_FOUND') {
        throw new InvoicePrinterServiceError('NOT_FOUND')
      }
      throw new InvoicePrinterServiceError(
        'PDF_FAILED',
        err instanceof Error ? err.message : 'Could not render the invoice PDF',
      )
    }
    const attachments: Array<{
      filename: string
      content: Buffer
      contentType?: string
      contentDisposition?: 'inline' | 'attachment'
    }> = [{
      filename: invoicePdf.filename || `${invoiceNumber}.pdf`,
      content: invoicePdf.pdf,
      contentType: 'application/pdf',
      contentDisposition: 'attachment',
    }]
    if (includedServiceLog) attachments.push(await serviceLogAttachment(db))
    delivered = await deliverPrinterEmail(db, {
      printerEmail: destination.email,
      subject,
      text,
      attachments,
    })
  }
  const printerLabel = destination.kind === 'shop' ? destination.label : destination.email
  const printerEmail = destination.kind === 'email' ? destination.email : ''

  if (includeMode === 'auto' && settings.printBlankServiceLogAfterInvoice) {
    await incrementInvoicePrinterCount(db, actorId)
  }

  await writeAudit(null, {
    entityType: 'invoice',
    entityId: invoiceId,
    action: 'invoices.printer_print',
    permissionKey: 'invoices.send.all',
    riskLevel: 'normal',
    afterData: {
      via: options.source ?? 'susan',
      actorId,
      destination: destination.kind,
      printerLabel,
      attachments: kinds,
      includedServiceLog,
    },
  }).catch(() => undefined)

  return {
    destination: destination.kind,
    printerEmail,
    printerLabel,
    delivered,
    attachments: kinds,
    invoiceId,
    invoiceNumber,
    includedServiceLog,
  }
}

/**
 * Fire-and-forget auto-print after a customer invoice send is queued.
 * Never throws — print failures must not block customer email.
 */
export async function maybeAutoPrintInvoiceOnSend(
  db: Db,
  invoiceId: string,
  actorId: string,
): Promise<InvoicePrinterSendResult | null> {
  try {
    const settings = await getInvoiceWorkspaceSettings(db)
    if (!settings.autoPrintOnSend) return null
    if (settings.autoPrintDestination === 'shop') {
      if (!QUEUE_RE.test(settings.autoPrintQueue.trim())) return null
    }
    else if (!isValidPrinterEmail(settings.printerEmail)) return null

    return await printInvoiceToPrinter(db, invoiceId, actorId, {
      includeServiceLog: 'auto',
      source: 'auto_send',
    })
  }
  catch (err) {
    console.warn(
      '[invoice-printer] auto print on send failed:',
      err instanceof Error ? err.message : err,
    )
    return null
  }
}
