import type { Db } from '../../db/client'
import { mergeInvoicePdfsNewestFirst } from '../invoice-print.service'
import { renderServiceLogSheetPdf } from '../service-log-sheet.service'
import { postDocumentPrintedTeamMessage } from '../workflow-chat.service'
import { releaseQueues, submitFile } from './engine'
import { PrintError } from './errors'

export type AppPrintKind = 'invoice' | 'service-log-sheet'

function batchFilename(numbers: string[]): string {
  if (numbers.length === 1) return `${numbers[0]}.pdf`
  const joined = `Invoices ${numbers.join(', ')}`
  return `${joined.length > 170 ? `${joined.slice(0, 160)} +${numbers.length}` : joined}.pdf`
}

/** Render an in-app document and queue it on a shop printer. */
export async function sendAppDocument(
  db: Db,
  opts: {
    kind: AppPrintKind
    queue: string
    invoiceIds?: string[]
    copies?: number
    sides?: string
    actorUserId: string
    actorName: string
  },
) {
  let pdf: Buffer
  let filename: string
  let printed: Array<{ label: string, entityId?: string }>
  if (opts.kind === 'invoice') {
    if (!opts.invoiceIds?.length) throw new PrintError('Choose an invoice to print')
    const merged = await mergeInvoicePdfsNewestFirst(db, opts.invoiceIds)
    pdf = merged.pdf
    filename = batchFilename(merged.invoices.map(inv => inv.invoiceNumberFormatted))
    printed = merged.invoices.map(inv => ({ label: inv.invoiceNumberFormatted, entityId: inv.id }))
  }
  else {
    pdf = await renderServiceLogSheetPdf(db)
    filename = 'Blank service log sheet.pdf'
    printed = [{ label: 'Blank service log sheet' }]
  }
  const jobId = await submitFile(db, {
    filename,
    data: pdf,
    queue: opts.queue,
    copies: opts.copies ?? 1,
    sides: opts.sides || 'one-sided',
    source: 'app',
    sender: opts.actorName,
    release: false,
  })
  void releaseQueues(db).catch(() => {})
  for (const item of printed) {
    await postDocumentPrintedTeamMessage(db, {
      senderUserId: opts.actorUserId,
      documentLabel: item.label,
      ...(item.entityId ? { entityType: 'invoice' as const, entityId: item.entityId } : {}),
    }).catch(() => {})
  }
  return { jobId, filename }
}
