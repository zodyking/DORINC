import { desc, eq, inArray } from 'drizzle-orm'
import type { Db } from '../db/client'
import { formatInvoiceNumber, invoices } from '../db/schema/invoices'
import { mergePdfBuffers } from './pdf-merge.service'
import { previewInvoicePdf, InvoicePdfServiceError } from './invoice-pdf.service'
import {
  StaplesPrintMeServiceError,
  startStaplesPrintMeJob,
  type StaplesPrintJobView,
} from './staples-printme.service'
import { postDocumentPrintedTeamMessage } from './workflow-chat.service'

export class InvoicePrintServiceError extends Error {
  constructor(
    public code: 'NOT_FOUND' | 'VALIDATION' | 'PDF_FAILED' | 'FORBIDDEN',
    message: string,
  ) {
    super(message)
    this.name = 'InvoicePrintServiceError'
  }
}

export type InvoiceBulkPrintMode = 'device' | 'staples'

/** Load invoice rows newest → oldest (invoice number / created_at). */
async function loadInvoicesNewestFirst(db: Db, invoiceIds: string[]) {
  const unique = [...new Set(invoiceIds)]
  if (!unique.length) {
    throw new InvoicePrintServiceError('VALIDATION', 'Select at least one invoice')
  }
  if (unique.length > 100) {
    throw new InvoicePrintServiceError('VALIDATION', 'Select at most 100 invoices')
  }

  const rows = await db
    .select({
      id: invoices.id,
      invoiceNumber: invoices.invoiceNumber,
      createdAt: invoices.createdAt,
    })
    .from(invoices)
    .where(inArray(invoices.id, unique))
    .orderBy(desc(invoices.invoiceNumber), desc(invoices.createdAt))

  if (rows.length !== unique.length) {
    throw new InvoicePrintServiceError('NOT_FOUND', 'One or more invoices were not found')
  }

  return rows
}

export async function mergeInvoicePdfsNewestFirst(
  db: Db,
  invoiceIds: string[],
): Promise<{
  pdf: Buffer
  filename: string
  documentLabel: string
  invoices: Array<{ id: string, invoiceNumberFormatted: string }>
}> {
  const rows = await loadInvoicesNewestFirst(db, invoiceIds)
  const pdfs: Buffer[] = []
  const meta: Array<{ id: string, invoiceNumberFormatted: string }> = []

  for (const row of rows) {
    try {
      const rendered = await previewInvoicePdf(db, row.id)
      pdfs.push(rendered.pdf)
      meta.push({
        id: row.id,
        invoiceNumberFormatted: rendered.invoiceNumberFormatted
          || formatInvoiceNumber(row.invoiceNumber),
      })
    }
    catch (err) {
      if (err instanceof InvoicePdfServiceError && err.code === 'NOT_FOUND') {
        throw new InvoicePrintServiceError('NOT_FOUND', 'One or more invoices were not found')
      }
      throw new InvoicePrintServiceError(
        'PDF_FAILED',
        err instanceof Error ? err.message : 'Could not render an invoice PDF',
      )
    }
  }

  const pdf = await mergePdfBuffers(pdfs)
  const label = meta.length === 1
    ? meta[0]!.invoiceNumberFormatted
    : `${meta.length} invoices`
  const filename = meta.length === 1
    ? `${meta[0]!.invoiceNumberFormatted}.pdf`
    : `invoices-${meta.length}.pdf`

  return {
    pdf,
    filename,
    documentLabel: label,
    invoices: meta,
  }
}

export async function bulkPrintInvoices(
  db: Db,
  actorUserId: string,
  opts: { invoiceIds: string[], mode: InvoiceBulkPrintMode },
): Promise<
  | { mode: 'device', pdf: Buffer, filename: string, documentLabel: string, invoiceIds: string[] }
  | { mode: 'staples', job: StaplesPrintJobView }
> {
  const merged = await mergeInvoicePdfsNewestFirst(db, opts.invoiceIds)

  if (opts.mode === 'device') {
    // One team message per invoice so each document stays hyperlinkable in chat/email.
    for (const inv of merged.invoices) {
      await postDocumentPrintedTeamMessage(db, {
        senderUserId: actorUserId,
        documentLabel: inv.invoiceNumberFormatted,
        entityType: 'invoice',
        entityId: inv.id,
      })
    }
    return {
      mode: 'device',
      pdf: merged.pdf,
      filename: merged.filename,
      documentLabel: merged.documentLabel,
      invoiceIds: merged.invoices.map(i => i.id),
    }
  }

  try {
    const job = await startStaplesPrintMeJob(db, actorUserId, {
      documentType: 'invoice_batch',
      entityId: merged.invoices[0]?.id ?? null,
      pdfOverride: merged.pdf,
      documentLabel: merged.documentLabel,
      filename: merged.filename,
    })
    return { mode: 'staples', job }
  }
  catch (err) {
    if (err instanceof StaplesPrintMeServiceError) {
      throw new InvoicePrintServiceError(
        err.code === 'NOT_FOUND' ? 'NOT_FOUND' : 'PDF_FAILED',
        err.message,
      )
    }
    throw err
  }
}

export async function notifyInvoicePrinted(
  db: Db,
  actorUserId: string,
  invoiceId: string,
): Promise<void> {
  const [row] = await db
    .select({
      id: invoices.id,
      invoiceNumber: invoices.invoiceNumber,
    })
    .from(invoices)
    .where(eq(invoices.id, invoiceId))
    .limit(1)

  if (!row) throw new InvoicePrintServiceError('NOT_FOUND', 'Invoice not found')

  await postDocumentPrintedTeamMessage(db, {
    senderUserId: actorUserId,
    documentLabel: formatInvoiceNumber(row.invoiceNumber),
    entityType: 'invoice',
    entityId: row.id,
  })
}
