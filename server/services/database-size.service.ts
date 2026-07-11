import { desc } from 'drizzle-orm'
import type { Db } from '../db/client'
import { dbSizeSnapshots } from '../db/schema/db-size-snapshots'

const SNAPSHOT_INTERVAL_MS = 6 * 60 * 60 * 1000
const HISTORY_LIMIT = 120

export interface DatabaseSizePoint {
  recordedAt: string
  databaseBytes: number
}

export interface DatabaseSizeMetrics {
  currentBytes: number
  history: DatabaseSizePoint[]
  lastSnapshotAt: string | null
  change7dBytes: number | null
  change7dPercent: number | null
}

async function queryCurrentDatabaseBytes(): Promise<bigint> {
  const { usePool } = await import('../db/client')
  const { rows } = await usePool().query<{ size: string }>(
    'SELECT pg_database_size(current_database())::text AS size',
  )
  const size = rows[0]?.size
  if (!size) throw new Error('Could not read database size')
  return BigInt(size)
}

async function maybeRecordSnapshot(db: Db, currentBytes: bigint) {
  const [latest] = await db.select({
    recordedAt: dbSizeSnapshots.recordedAt,
  })
    .from(dbSizeSnapshots)
    .orderBy(desc(dbSizeSnapshots.recordedAt))
    .limit(1)

  const shouldRecord = !latest
    || (Date.now() - latest.recordedAt.getTime() >= SNAPSHOT_INTERVAL_MS)

  if (!shouldRecord) return

  await db.insert(dbSizeSnapshots).values({
    databaseBytes: currentBytes,
  })
}

function bytesToNumber(value: bigint): number {
  const max = BigInt(Number.MAX_SAFE_INTEGER)
  if (value > max) return Number(max)
  return Number(value)
}

export async function getDatabaseSizeMetrics(db: Db): Promise<DatabaseSizeMetrics> {
  const currentBytesBig = await queryCurrentDatabaseBytes()
  await maybeRecordSnapshot(db, currentBytesBig)

  const rows = await db.select({
    recordedAt: dbSizeSnapshots.recordedAt,
    databaseBytes: dbSizeSnapshots.databaseBytes,
  })
    .from(dbSizeSnapshots)
    .orderBy(desc(dbSizeSnapshots.recordedAt))
    .limit(HISTORY_LIMIT)

  const history = rows
    .map(row => ({
      recordedAt: row.recordedAt.toISOString(),
      databaseBytes: bytesToNumber(row.databaseBytes),
    }))
    .reverse()

  const currentBytes = bytesToNumber(currentBytesBig)
  const lastSnapshotAt = history.length ? history[history.length - 1]!.recordedAt : null

  const weekAgo = Date.now() - 7 * 24 * 60 * 60 * 1000
  const baseline = history.find((point) => {
    const ts = new Date(point.recordedAt).getTime()
    return ts <= weekAgo
  }) ?? history[0]

  let change7dBytes: number | null = null
  let change7dPercent: number | null = null
  if (baseline && history.length > 1) {
    change7dBytes = currentBytes - baseline.databaseBytes
    if (baseline.databaseBytes > 0) {
      change7dPercent = (change7dBytes / baseline.databaseBytes) * 100
    }
  }

  return {
    currentBytes,
    history,
    lastSnapshotAt,
    change7dBytes,
    change7dPercent,
  }
}
