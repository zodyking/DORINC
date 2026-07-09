import { and, desc, eq, inArray, sql } from 'drizzle-orm'
import type { Db } from '../db/client'
import { workerJobs } from '../db/schema/jobs'
import { pdfRenderJobs } from '../db/schema/pdf-render-jobs'

const STALE_PROCESSING_MS = 10 * 60 * 1000
const BACKLOG_QUEUED_MS = 5 * 60 * 1000

export type PdfWorkerStatus = 'running' | 'idle' | 'backlog' | 'error' | 'unknown'
export type WorkerQueueStatus = 'healthy' | 'idle' | 'backlog' | 'error'

export interface PdfWorkerHealth {
  status: PdfWorkerStatus
  message: string
  queued: number
  processing: number
  failed: number
  lastSuccessAt: string | null
}

export interface WorkerQueueHealth {
  status: WorkerQueueStatus
  message: string
  queued: number
  processing: number
  failed: number
  byType: Record<string, { queued: number, processing: number, failed: number }>
  lastActivityAt: string | null
}

type StatusCounts = Record<'queued' | 'processing' | 'failed', number>

async function countByStatus(
  db: Db,
  table: typeof workerJobs | typeof pdfRenderJobs,
): Promise<StatusCounts> {
  const rows = await db
    .select({
      status: table.status,
      count: sql<number>`count(*)::int`,
    })
    .from(table)
    .where(inArray(table.status, ['queued', 'processing', 'failed']))
    .groupBy(table.status)

  const counts: StatusCounts = { queued: 0, processing: 0, failed: 0 }
  for (const row of rows) {
    if (row.status === 'queued' || row.status === 'processing' || row.status === 'failed') {
      counts[row.status] = row.count
    }
  }
  return counts
}

async function countStaleProcessing(db: Db, table: typeof workerJobs | typeof pdfRenderJobs): Promise<number> {
  const [row] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(table)
    .where(and(
      eq(table.status, 'processing'),
      sql`${table.startedAt} is not null`,
      sql`${table.startedAt} < now() - make_interval(secs => ${STALE_PROCESSING_MS / 1000})`,
    ))
  return row?.count ?? 0
}

async function countBacklogQueued(db: Db, table: typeof workerJobs | typeof pdfRenderJobs): Promise<number> {
  const [row] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(table)
    .where(and(
      eq(table.status, 'queued'),
      sql`${table.runAfter} <= now()`,
      sql`${table.createdAt} < now() - make_interval(secs => ${BACKLOG_QUEUED_MS / 1000})`,
    ))
  return row?.count ?? 0
}

async function lastFinishedAt(db: Db, table: typeof workerJobs | typeof pdfRenderJobs): Promise<Date | null> {
  const [row] = await db
    .select({ finishedAt: table.finishedAt })
    .from(table)
    .where(eq(table.status, 'done'))
    .orderBy(desc(table.finishedAt))
    .limit(1)
  return row?.finishedAt ?? null
}

function pdfWorkerMessage(counts: StatusCounts): string {
  const parts = ['Playwright Chromium']
  if (counts.queued + counts.processing === 0) parts.push('queue idle')
  else parts.push(`${counts.queued} queued · ${counts.processing} active`)
  parts.push(`${counts.failed} failed`)
  return parts.join(' · ')
}

function workerQueueMessage(counts: StatusCounts): string {
  if (counts.queued + counts.processing + counts.failed === 0) return 'All queues idle · 0 pending'
  return `${counts.queued} queued · ${counts.processing} active · ${counts.failed} failed`
}

function resolvePdfWorkerStatus(
  counts: StatusCounts,
  staleProcessing: number,
  backlogQueued: number,
  lastSuccessAt: Date | null,
): PdfWorkerStatus {
  if (staleProcessing > 0 || (counts.failed > 0 && backlogQueued > 0)) return 'error'
  if (backlogQueued > 0) return 'backlog'
  if (counts.processing > 0) return 'running'
  if (counts.queued + counts.failed === 0) {
    return lastSuccessAt ? 'idle' : 'unknown'
  }
  return 'running'
}

function resolveWorkerQueueStatus(
  counts: StatusCounts,
  staleProcessing: number,
  backlogQueued: number,
): WorkerQueueStatus {
  if (staleProcessing > 0) return 'error'
  if (backlogQueued > 0) return 'backlog'
  if (counts.queued + counts.processing + counts.failed === 0) return 'idle'
  return 'healthy'
}

export async function getPdfWorkerHealth(db: Db): Promise<PdfWorkerHealth> {
  const [counts, staleProcessing, backlogQueued, lastSuccess] = await Promise.all([
    countByStatus(db, pdfRenderJobs),
    countStaleProcessing(db, pdfRenderJobs),
    countBacklogQueued(db, pdfRenderJobs),
    lastFinishedAt(db, pdfRenderJobs),
  ])

  const status = resolvePdfWorkerStatus(counts, staleProcessing, backlogQueued, lastSuccess)
  let message = pdfWorkerMessage(counts)
  if (status === 'backlog') message = `${message} · jobs waiting`
  if (status === 'error') message = staleProcessing > 0 ? `${message} · stuck job` : `${message} · check worker logs`

  return {
    status,
    message,
    queued: counts.queued,
    processing: counts.processing,
    failed: counts.failed,
    lastSuccessAt: lastSuccess?.toISOString() ?? null,
  }
}

export async function getWorkerQueueHealth(db: Db): Promise<WorkerQueueHealth> {
  const [counts, staleProcessing, backlogQueued, rows, lastDone, lastFailed] = await Promise.all([
    countByStatus(db, workerJobs),
    countStaleProcessing(db, workerJobs),
    countBacklogQueued(db, workerJobs),
    db
      .select({
        jobType: workerJobs.jobType,
        status: workerJobs.status,
        count: sql<number>`count(*)::int`,
      })
      .from(workerJobs)
      .where(inArray(workerJobs.status, ['queued', 'processing', 'failed']))
      .groupBy(workerJobs.jobType, workerJobs.status),
    lastFinishedAt(db, workerJobs),
    db
      .select({ finishedAt: workerJobs.finishedAt })
      .from(workerJobs)
      .where(eq(workerJobs.status, 'failed'))
      .orderBy(desc(workerJobs.finishedAt))
      .limit(1),
  ])

  const byType: WorkerQueueHealth['byType'] = {}
  for (const row of rows) {
    if (!byType[row.jobType]) {
      byType[row.jobType] = { queued: 0, processing: 0, failed: 0 }
    }
    const bucket = byType[row.jobType]!
    if (row.status === 'queued') bucket.queued = row.count
    else if (row.status === 'processing') bucket.processing = row.count
    else if (row.status === 'failed') bucket.failed = row.count
  }

  const status = resolveWorkerQueueStatus(counts, staleProcessing, backlogQueued)
  let message = workerQueueMessage(counts)
  if (status === 'backlog') message = `${message} · worker may be down`
  if (status === 'error') message = `${message} · stuck processing job`

  const lastActivity = [lastDone, lastFailed[0]?.finishedAt ?? null]
    .filter((d): d is Date => d != null)
    .sort((a, b) => b.getTime() - a.getTime())[0] ?? null

  return {
    status,
    message,
    queued: counts.queued,
    processing: counts.processing,
    failed: counts.failed,
    byType,
    lastActivityAt: lastActivity?.toISOString() ?? null,
  }
}
