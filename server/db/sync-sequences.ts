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

const SEQUENCE_TABLES = {
  invoice_number_seq: { maxColumn: 'invoice_number', tableName: 'invoices' },
  service_log_number_seq: { maxColumn: 'log_number', tableName: 'service_logs' },
  estimate_number_seq: { maxColumn: 'estimate_number', tableName: 'estimates' },
} as const satisfies Record<NumberSequenceName, { maxColumn: string, tableName: string }>

function firstRow<T>(result: { rows: T[] }): T | undefined {
  return result.rows[0]
}

interface SequenceState {
  maxNum: number
  seqVal: number
  seqCalled: boolean
}

function nextNumberFromSequence(state: SequenceState): number {
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

async function readSequenceState(
  db: Db,
  sequenceName: NumberSequenceName,
  maxColumn: string,
  tableName: string,
): Promise<SequenceState | null> {
  const result = await db.execute<{
    max_num: string
    seq_val: string
    seq_called: boolean
  }>(sql`
    SELECT
      COALESCE((SELECT MAX(${sql.raw(maxColumn)}) FROM ${sql.raw(tableName)}), 0)::bigint AS max_num,
      s.last_value::bigint AS seq_val,
      s.is_called AS seq_called
    FROM ${sql.raw(sequenceName)} AS s
  `)
  const row = firstRow(result)
  if (!row) return null
  return {
    maxNum: Number(row.max_num),
    seqVal: Number(row.seq_val),
    seqCalled: Boolean(row.seq_called),
  }
}

/** Cheap check — only runs setval when the sequence would not allocate MAX + 1. */
async function ensureNumberSequence(db: Db, sequenceName: NumberSequenceName): Promise<void> {
  const { maxColumn, tableName } = SEQUENCE_TABLES[sequenceName]
  const floor = SEQUENCE_FLOORS[sequenceName]
  const state = await readSequenceState(db, sequenceName, maxColumn, tableName)
  if (!state) return

  const nextNeeded = nextNumberAfterMax(state.maxNum, floor)
  if (nextNumberFromSequence(state) !== nextNeeded) {
    await syncSequence(db, sequenceName, maxColumn, tableName)
  }
}

/** Cheap check — only runs setval when invoice_number_seq would not allocate MAX + 1. */
export async function ensureInvoiceNumberSequence(db: Db): Promise<void> {
  await ensureNumberSequence(db, 'invoice_number_seq')
}

/** Cheap check — only runs setval when service_log_number_seq would not allocate MAX + 1. */
export async function ensureServiceLogNumberSequence(db: Db): Promise<void> {
  await ensureNumberSequence(db, 'service_log_number_seq')
}

/** Realign invoice_number_seq with the highest stored invoice number. */
export async function syncInvoiceNumberSequence(db: Db): Promise<number> {
  const { maxColumn, tableName } = SEQUENCE_TABLES.invoice_number_seq
  return syncSequence(db, 'invoice_number_seq', maxColumn, tableName)
}

/** Realign service_log_number_seq with the highest stored log number. */
export async function syncServiceLogNumberSequence(db: Db): Promise<number> {
  const { maxColumn, tableName } = SEQUENCE_TABLES.service_log_number_seq
  return syncSequence(db, 'service_log_number_seq', maxColumn, tableName)
}

/** Realign PG sequences with current MAX() values after imports or manual inserts. */
export async function syncNumberSequences(db: Db): Promise<SyncedSequences> {
  const [invoiceNumber, serviceLogNumber, estimateNumber] = await Promise.all([
    syncInvoiceNumberSequence(db),
    syncServiceLogNumberSequence(db),
    syncSequence(db, 'estimate_number_seq', SEQUENCE_TABLES.estimate_number_seq.maxColumn, SEQUENCE_TABLES.estimate_number_seq.tableName),
  ])

  return {
    invoiceNumber,
    serviceLogNumber,
    estimateNumber,
  }
}
