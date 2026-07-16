import { sql } from 'drizzle-orm'
import type { Db } from './client'

export interface SyncedSequences {
  invoiceNumber: number
  serviceLogNumber: number
  estimateNumber: number
}

/** Must match pgSequence startWith in schema definitions. */
const SEQUENCE_FLOORS = {
  invoice_number_seq: 93,
  service_log_number_seq: 1001,
  estimate_number_seq: 1,
} as const

type NumberSequenceName = keyof typeof SEQUENCE_FLOORS

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

function nextNumberAfterMax(maxNum: number, floor: number): number {
  return Math.max(maxNum, floor - 1) + 1
}

/** setval rejects 0 and values below the sequence minimum — use floor with is_called=false when empty. */
function syncSequenceSql(sequenceName: NumberSequenceName, maxColumn: string, tableName: string) {
  const floor = SEQUENCE_FLOORS[sequenceName]
  return sql`
    SELECT setval(
      ${sequenceName},
      CASE
        WHEN COALESCE((SELECT MAX(${sql.raw(maxColumn)}) FROM ${sql.raw(tableName)}), 0) < ${floor}
        THEN ${floor}
        ELSE (SELECT MAX(${sql.raw(maxColumn)}) FROM ${sql.raw(tableName)})
      END,
      COALESCE((SELECT MAX(${sql.raw(maxColumn)}) FROM ${sql.raw(tableName)}), 0) < ${floor}
    ) AS setval
  `
}

async function syncSequence(
  db: Db,
  sequenceName: NumberSequenceName,
  maxColumn: string,
  tableName: string,
): Promise<number> {
  const result = await db.execute<{ setval: string }>(
    syncSequenceSql(sequenceName, maxColumn, tableName),
  )
  return Number(firstRow(result)?.setval ?? 0)
}

/** Cheap check — only runs setval when the sequence would not allocate MAX + 1. */
export async function ensureInvoiceNumberSequence(db: Db): Promise<void> {
  const floor = SEQUENCE_FLOORS.invoice_number_seq
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
  const nextNeeded = nextNumberAfterMax(state.maxNum, floor)
  if (nextInvoiceNumberFromSequence(state) !== nextNeeded) {
    await syncInvoiceNumberSequence(db)
  }
}

/** Realign invoice_number_seq with the highest stored invoice number. */
export async function syncInvoiceNumberSequence(db: Db): Promise<number> {
  return syncSequence(db, 'invoice_number_seq', 'invoice_number', 'invoices')
}

/** Realign PG sequences with current MAX() values after imports or manual inserts. */
export async function syncNumberSequences(db: Db): Promise<SyncedSequences> {
  const [invoiceNumber, serviceLogNumber, estimateNumber] = await Promise.all([
    syncInvoiceNumberSequence(db),
    syncSequence(db, 'service_log_number_seq', 'log_number', 'service_logs'),
    syncSequence(db, 'estimate_number_seq', 'estimate_number', 'estimates'),
  ])

  return {
    invoiceNumber,
    serviceLogNumber,
    estimateNumber,
  }
}