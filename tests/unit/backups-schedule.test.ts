// Unit tests for backup schedule + Google Drive helpers (P2-17).
import { describe, expect, it } from 'vitest'
import { formatScheduleLabel, isDailyCronDue } from '../../server/services/backups.service'

describe('backup schedule helpers (P2-17)', () => {
  it('detects when daily cron is due', () => {
    const dueAt = new Date('2026-07-08T02:00:00Z')
    expect(isDailyCronDue('0 2 * * *', dueAt)).toBe(true)
    expect(isDailyCronDue('0 3 * * *', dueAt)).toBe(false)
    expect(isDailyCronDue('30 2 * * *', dueAt)).toBe(false)
  })

  it('formats nightly schedule label', () => {
    expect(formatScheduleLabel('0 2 * * *')).toBe('Nightly · 2:00 AM UTC')
    expect(formatScheduleLabel('30 14 * * *')).toBe('Nightly · 2:30 PM UTC')
  })
})
