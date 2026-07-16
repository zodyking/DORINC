import { sql } from 'drizzle-orm'
import type { Db } from './client'

export interface SyncedSequences {
  invoiceNumber: number
  serviceLogNumber: number
  estimateNumber: number
}

/** Realign invoice_number_seq with the highest stored invoice number. */
export async function syncInvoiceNumberSequence(db: Db): Promise<number> {
  const [invoice] = await db.execute<{ setval: string }>(sql`
    SELECT setval(
      'invoice_number_seq',
      COALESCE((SELECT MAX(invoice_number) FROM invoices), 0)
    ) AS setval
  `)
  return Number(invoice?.setval ?? 0)
}

/** Realign PG sequences with current MAX() values after imports or manual inserts. */
export async function syncNumberSequences(db: Db): Promise<SyncedSequences> {
  const invoiceNumber = await syncInvoiceNumberSequence(db)
  const [serviceLog] = await db.execute<{ setval: string }>(sql`
    SELECT setval(
      'service_log_number_seq',
      COALESCE((SELECT MAX(log_number) FROM service_logs), 0)
    ) AS setval
  `)
  const [estimate] = await db.execute<{ setval: string }>(sql`
    SELECT setval(
      'estimate_number_seq',
      COALESCE((SELECT MAX(estimate_number) FROM estimates), 0)
    ) AS setval
  `)

  return {
    invoiceNumber,
    serviceLogNumber: Number(serviceLog?.setval ?? 0),
    estimateNumber: Number(estimate?.setval ?? 0),
  }
}
