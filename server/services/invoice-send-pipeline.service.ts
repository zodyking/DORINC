import { usePool } from '../db/client'
// @ts-expect-error plain-JS worker handler has no type declarations
import { processPdfRenderJobById } from '../workers/handlers/pdf-render.mjs'
// @ts-expect-error plain-JS worker handler has no type declarations
import { processInvoiceSendJobs } from '../workers/handlers/invoice-send.mjs'

/**
 * Advance PDF generation + email delivery for one invoice.
 * Called from send-status polls so delivery can complete without separate worker containers.
 */
export async function advanceInvoiceSendPipeline(invoiceId: string): Promise<void> {
  const pool = usePool()

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
}
