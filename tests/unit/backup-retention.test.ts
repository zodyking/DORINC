// Unit tests for backup retention selection (P3-11).
import { describe, expect, it } from 'vitest'
import { selectBackupsToKeep, type BackupRunRetentionRow } from '../../server/services/backup-retention.service'

function runAt(daysAgo: number, now: Date): BackupRunRetentionRow {
  const createdAt = new Date(now)
  createdAt.setUTCDate(createdAt.getUTCDate() - daysAgo)
  return {
    id: `run-${daysAgo}`,
    createdAt,
    filename: `backup_${daysAgo}.enc`,
    driveFileId: null,
  }
}

describe('P3-11 backup retention selection', () => {
  it('keeps all daily backups inside retention window', () => {
    const now = new Date('2026-07-08T12:00:00Z')
    const runs = [runAt(1, now), runAt(5, now), runAt(29, now)]
    const keep = selectBackupsToKeep(runs, { retentionDaily: 30, retentionWeekly: 12, retentionMonthly: 12 }, now)
    expect(keep.has('run-1')).toBe(true)
    expect(keep.has('run-5')).toBe(true)
    expect(keep.has('run-29')).toBe(true)
  })

  it('drops backups outside all retention tiers', () => {
    const now = new Date('2026-07-08T12:00:00Z')
    const runs = [runAt(400, now)]
    const keep = selectBackupsToKeep(runs, { retentionDaily: 30, retentionWeekly: 12, retentionMonthly: 12 }, now)
    expect(keep.size).toBe(0)
  })

  it('keeps one backup per week beyond daily window', () => {
    const now = new Date('2026-07-08T12:00:00Z')
    const runs = [runAt(35, now), runAt(36, now), runAt(42, now)]
    const keep = selectBackupsToKeep(runs, { retentionDaily: 30, retentionWeekly: 12, retentionMonthly: 12 }, now)
    expect(keep.size).toBe(2)
    expect(keep.has('run-35')).toBe(true)
    expect(keep.has('run-42')).toBe(true)
  })
})
