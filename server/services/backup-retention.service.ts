import { desc, eq, inArray } from 'drizzle-orm'
import type { H3Event } from 'h3'
import type { Db } from '../db/client'
import { backupRuns } from '../db/schema/backups'
import { ensureBackupSettings } from './backups.service'
import { writeAudit } from './audit.service'

export interface RetentionPolicy {
  retentionDaily: number
  retentionWeekly: number
  retentionMonthly: number
}

export interface BackupRunRetentionRow {
  id: string
  createdAt: Date
  filename: string
  driveFileId: string | null
}

function isoWeekKey(date: Date): string {
  const d = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()))
  const day = d.getUTCDay() || 7
  d.setUTCDate(d.getUTCDate() + 4 - day)
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1))
  const week = Math.ceil((((d.getTime() - yearStart.getTime()) / 86400000) + 1) / 7)
  return `${d.getUTCFullYear()}-W${String(week).padStart(2, '0')}`
}

function monthKey(date: Date): string {
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`
}

/** GFS-style retention — daily within N days, weekly within N weeks, monthly within N months. */
export function selectBackupsToKeep(
  runs: BackupRunRetentionRow[],
  policy: RetentionPolicy,
  now = new Date(),
): Set<string> {
  const keep = new Set<string>()
  const sorted = [...runs].sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())

  const dailyCutoff = new Date(now)
  dailyCutoff.setUTCDate(dailyCutoff.getUTCDate() - policy.retentionDaily)

  const weeklyCutoff = new Date(now)
  weeklyCutoff.setUTCDate(weeklyCutoff.getUTCDate() - policy.retentionWeekly * 7)

  const monthlyCutoff = new Date(now)
  monthlyCutoff.setUTCMonth(monthlyCutoff.getUTCMonth() - policy.retentionMonthly)

  const weeklyKept = new Set<string>()
  const monthlyKept = new Set<string>()

  for (const run of sorted) {
    const at = run.createdAt
    if (at >= dailyCutoff) {
      keep.add(run.id)
      continue
    }
    if (at >= weeklyCutoff) {
      const key = isoWeekKey(at)
      if (!weeklyKept.has(key)) {
        weeklyKept.add(key)
        keep.add(run.id)
      }
      continue
    }
    if (at >= monthlyCutoff) {
      const key = monthKey(at)
      if (!monthlyKept.has(key)) {
        monthlyKept.add(key)
        keep.add(run.id)
      }
    }
  }

  return keep
}

export async function pruneExpiredBackups(
  db: Db,
  event: H3Event | null = null,
): Promise<{ pruned: number, kept: number }> {
  const settings = await ensureBackupSettings(db)
  const policy: RetentionPolicy = {
    retentionDaily: settings.retentionDaily,
    retentionWeekly: settings.retentionWeekly,
    retentionMonthly: settings.retentionMonthly,
  }

  const runs = await db.select({
    id: backupRuns.id,
    createdAt: backupRuns.createdAt,
    filename: backupRuns.filename,
    driveFileId: backupRuns.driveFileId,
  })
    .from(backupRuns)
    .where(eq(backupRuns.status, 'completed'))
    .orderBy(desc(backupRuns.createdAt))

  if (!runs.length) return { pruned: 0, kept: 0 }

  const keep = selectBackupsToKeep(runs, policy)
  const toDelete = runs.filter(r => !keep.has(r.id))

  if (!toDelete.length) return { pruned: 0, kept: keep.size }

  const ids = toDelete.map(r => r.id)
  await db.delete(backupRuns).where(inArray(backupRuns.id, ids))

  await writeAudit(event, {
    entityType: 'backup',
    entityId: settings.id,
    action: 'backup.retention_pruned',
    afterData: {
      pruned: toDelete.length,
      kept: keep.size,
      policy,
      filenames: toDelete.map(r => r.filename),
    },
    permissionKey: 'backups.manage.all',
    riskLevel: 'sensitive',
  })

  return { pruned: toDelete.length, kept: keep.size }
}

/** Enqueue retention prune at most once per UTC day. */
export async function maybeEnqueueRetentionPrune(db: Db): Promise<boolean> {
  const startOfDay = new Date()
  startOfDay.setUTCHours(0, 0, 0, 0)

  const { workerJobs } = await import('../db/schema/jobs')
  const { and, gte } = await import('drizzle-orm')
  const [existing] = await db.select({ id: workerJobs.id })
    .from(workerJobs)
    .where(and(
      eq(workerJobs.jobType, 'backup_retention_prune'),
      gte(workerJobs.createdAt, startOfDay),
    ))
    .limit(1)
  if (existing) return false

  const { enqueueJob } = await import('./jobs.service')
  await enqueueJob(db, 'backup_retention_prune', { trigger: 'scheduled' })
  return true
}
