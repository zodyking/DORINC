import type { Pool } from 'pg'
import type { Db } from '../../server/db/client'
import { getInvoice } from '../../server/services/invoices.service'
// @ts-expect-error plain-JS worker handler has no type declarations
import { processPdfRenderJobById } from '../../server/workers/handlers/pdf-render.mjs'
// @ts-expect-error plain-JS worker handler has no type declarations
import { processInvoiceSendJobs } from '../../server/workers/handlers/invoice-send.mjs'

/** Queue send and run workers until the invoice is marked sent (integration tests). */
export async function sendAndDeliverInvoice(
  db: Db,
  pool: Pool,
  invoiceId: string,
  actorId: string,
  actorAccountType?: string | null,
) {
  const { sendInvoice } = await import('../../server/services/invoices.service')
  await sendInvoice(db, invoiceId, actorId, actorAccountType)
  return flushInvoiceSendPipeline(pool, db, invoiceId)
}

/** Run pdf-worker + general worker steps until invoice reaches sent (integration tests). */
export async function flushInvoiceSendPipeline(
  pool: Pool,
  db: Db,
  invoiceId: string,
  opts: { timeoutMs?: number } = {},
) {
  const deadline = Date.now() + (opts.timeoutMs ?? 120_000)

  while (Date.now() < deadline) {
    const invoice = await getInvoice(db, invoiceId)
    if (invoice.status === 'sent' || invoice.status === 'paid') return invoice

    const { rows: pdfJobs } = await pool.query<{ id: string, status: string }>(
      `SELECT id, status FROM pdf_render_jobs
       WHERE entity_type = 'invoice' AND entity_id = $1
       ORDER BY created_at DESC LIMIT 1`,
      [invoiceId],
    )
    const pdfJob = pdfJobs[0]
    if (pdfJob && pdfJob.status !== 'done' && pdfJob.status !== 'failed') {
      await processPdfRenderJobById(pool, pdfJob.id)
    }

    await processInvoiceSendJobs(pool, 1)

    await new Promise(r => setTimeout(r, 50))
  }

  const invoice = await getInvoice(db, invoiceId)
  throw new Error(`Invoice ${invoiceId} did not reach sent (status=${invoice.status})`)
}
