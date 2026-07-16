import { sql } from 'drizzle-orm'
import type { Db } from './client'

export interface SyncedSequences {
  invoiceNumber: number
  serviceLogNumber: number
  estimateNumber: number
}

function firstRow<T>(result: { rows: T[] }): T | undefined {
  return result.rows[0]
}

interface InvoiceSequenceState {
  maxNum: number
  seqVal: number
  seqCalled: boolean
}

function nextInvoiceNumberFromSequence(state: InvoiceSequenceState): number {
  return state.seqCalled ? state.seqVal + 1 : state.seqVal
}

/** Cheap check — only runs setval when the sequence would not allocate MAX + 1. */
export async function ensureInvoiceNumberSequence(db: Db): Promise<void> {
  const result = await db.execute<{
    max_num: string
    seq_val: string
    seq_called: boolean
  }>(sql`
    SELECT
      COALESCE((SELECT MAX(invoice_number) FROM invoices), 0)::bigint AS max_num,
      s.last_value::bigint AS seq_val,
      s.is_called AS seq_called
    FROM invoice_number_seq AS s
  `)
  const row = firstRow(result)
  if (!row) return

  const state: InvoiceSequenceState = {
    maxNum: Number(row.max_num),
    seqVal: Number(row.seq_val),
    seqCalled: Boolean(row.seq_called),
  }
  const nextNeeded = state.maxNum + 1
  if (nextInvoiceNumberFromSequence(state) !== nextNeeded) {
    await syncInvoiceNumberSequence(db)
  }
}

/** Realign invoice_number_seq with the highest stored invoice number. */
export async function syncInvoiceNumberSequence(db: Db): Promise<number> {
  const result = await db.execute<{ setval: string }>(sql`
    SELECT setval(
      'invoice_number_seq',
      COALESCE((SELECT MAX(invoice_number) FROM invoices), 0)
    ) AS setval
  `)
  return Number(firstRow(result)?.setval ?? 0)
}

/** Realign PG sequences with current MAX() values after imports or manual inserts. */
export async function syncNumberSequences(db: Db): Promise<SyncedSequences> {
  const invoiceNumber = await syncInvoiceNumberSequence(db)
  const serviceLogResult = await db.execute<{ setval: string }>(sql`
    SELECT setval(
      'service_log_number_seq',
      COALESCE((SELECT MAX(log_number) FROM service_logs), 0)
    ) AS setval
  `)
  const estimateResult = await db.execute<{ setval: string }>(sql`
    SELECT setval(
      'estimate_number_seq',
      COALESCE((SELECT MAX(estimate_number) FROM estimates), 0)
    ) AS setval
  `)

  return {
    invoiceNumber,
    serviceLogNumber: Number(firstRow(serviceLogResult)?.setval ?? 0),
    estimateNumber: Number(firstRow(estimateResult)?.setval ?? 0),
  }
}
