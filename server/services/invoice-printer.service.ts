import type { Db } from '../db/client'
import { formatInvoiceNumber } from '../db/schema/invoices'
import { sendPrinterMail } from '../mail/mailer'
import {
  fitEmailPrintAttachments,
  isValidPrinterEmail,
  normalizePrinterEmail,
  shouldAttachBlankServiceLog,
} from '../../shared/invoice-printer'
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
  printerEmail: string
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
  return 'Shop printer email is not set. Add it in Control Panel → Invoices → Email to print.'
}

async function resolvePrinterEmail(db: Db): Promise<string> {
  const settings = await getInvoiceWorkspaceSettings(db)
  const email = normalizePrinterEmail(settings.printerEmail)
  if (!isValidPrinterEmail(email)) {
    throw new InvoicePrinterServiceError('NOT_CONFIGURED', printerNotConfiguredMessage())
  }
  return email
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
  printerEmail: string,
  attachments: Array<{
    filename: string
    content: Buffer
    contentType?: string
    contentDisposition?: 'inline' | 'attachment'
  }>,
): Promise<boolean> {
  const fitted = fitEmailPrintAttachments(attachments)
  if (!fitted.length) {
    throw new InvoicePrinterServiceError(
      'PDF_FAILED',
      'Printer attachments exceed Brother Email Print limits (10 files, 20 MB total) or were empty.',
    )
  }
  try {
    const { delivered } = await sendPrinterMail({
      to: printerEmail,
      attachments: fitted,
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
  const printerEmail = await resolvePrinterEmail(db)
  const attachment = await serviceLogAttachment(db)
  const delivered = await deliverPrinterEmail(printerEmail, [attachment])

  await writeAudit(null, {
    entityType: 'system',
    action: 'invoices.printer_print',
    permissionKey: 'invoices.send.all',
    riskLevel: 'normal',
    afterData: {
      via: source,
      actorId,
      printerEmail,
      attachments: ['service_log'],
    },
  }).catch(() => undefined)

  return {
    printerEmail,
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
  const printerEmail = await resolvePrinterEmail(db)
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

  const invoiceNumber = formatInvoiceNumber(invoice.invoiceNumber)
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
  const includeMode = options.includeServiceLog ?? false
  if (includeMode === true) {
    attachments.push(await serviceLogAttachment(db))
  }
  else if (includeMode === 'auto' && settings.printBlankServiceLogAfterInvoice) {
    const nextCount = (await getInvoicePrinterCount(db)) + 1
    if (shouldAttachBlankServiceLog(nextCount, settings.blankServiceLogEveryNInvoices)) {
      attachments.push(await serviceLogAttachment(db))
    }
  }

  const fitted = fitEmailPrintAttachments(attachments)
  const fittedKinds: InvoicePrinterAttachmentKind[] = fitted.map(att => (
    att.filename.includes('service-log') ? 'service_log' : 'invoice'
  ))
  const includedServiceLog = fittedKinds.includes('service_log')

  const delivered = await deliverPrinterEmail(printerEmail, fitted)

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
      printerEmail,
      attachments: fittedKinds,
      includedServiceLog,
    },
  }).catch(() => undefined)

  return {
    printerEmail,
    delivered,
    attachments: fittedKinds,
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
    if (!isValidPrinterEmail(settings.printerEmail)) return null

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
