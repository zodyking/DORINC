import { describe, expect, it } from 'vitest'
import { advanceAnnouncementQueue } from '../../app/utils/announcement-gate-queue'

describe('advanceAnnouncementQueue', () => {
  it('keeps the original session total while advancing the index', () => {
    const next = advanceAnnouncementQueue([
      { id: 'a', index: 1, total: 3 },
      { id: 'b', index: 2, total: 3 },
      { id: 'c', index: 3, total: 3 },
    ])

    expect(next).toEqual([
      { id: 'b', index: 2, total: 3 },
      { id: 'c', index: 3, total: 3 },
    ])

    const last = advanceAnnouncementQueue(next)
    expect(last).toEqual([{ id: 'c', index: 3, total: 3 }])
    expect(advanceAnnouncementQueue(last)).toEqual([])
  })
})
