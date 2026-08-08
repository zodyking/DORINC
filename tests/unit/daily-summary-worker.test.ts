import { describe, expect, it, vi } from 'vitest'
import { isDailySummaryDue, maybeEnqueueDailySummary } from '../../server/workers/handlers/daily-summary.mjs'

function mockPool(responses: Array<{ rows: Array<{ value?: Record<string, unknown> }> }>) {
  let i = 0
  return {
    query: vi.fn(async () => {
      const next = responses[Math.min(i, responses.length - 1)]!
      i += 1
      return next
    }),
  }
}

describe('daily-summary worker gate', () => {
  it('never uses tsx and always no-ops maybeEnqueueDailySummary', async () => {
    await expect(maybeEnqueueDailySummary({} as never)).resolves.toBe(false)
  })

  it('is due when enabled, matching UTC hour, and not sent today', async () => {
    const now = new Date('2026-08-08T13:15:00.000Z')
    const pool = mockPool([
      { rows: [{ value: { dailySummaryReport: true, dailySummarySendHourUtc: 13 } }] },
      { rows: [{ value: { date: '2026-08-07' } }] },
    ])
    await expect(isDailySummaryDue(pool as never, now)).resolves.toBe(true)
  })

  it('is not due outside the configured UTC hour', async () => {
    const now = new Date('2026-08-08T12:15:00.000Z')
    const pool = mockPool([
      { rows: [{ value: { dailySummaryReport: true, dailySummarySendHourUtc: 13 } }] },
    ])
    await expect(isDailySummaryDue(pool as never, now)).resolves.toBe(false)
  })

  it('is not due when already sent today', async () => {
    const now = new Date('2026-08-08T13:15:00.000Z')
    const pool = mockPool([
      { rows: [{ value: { dailySummaryReport: true, dailySummarySendHourUtc: 13 } }] },
      { rows: [{ value: { date: '2026-08-08' } }] },
    ])
    await expect(isDailySummaryDue(pool as never, now)).resolves.toBe(false)
  })

  it('is not due when the notification is disabled', async () => {
    const now = new Date('2026-08-08T13:15:00.000Z')
    const pool = mockPool([
      { rows: [{ value: { dailySummaryReport: false, dailySummarySendHourUtc: 13 } }] },
    ])
    await expect(isDailySummaryDue(pool as never, now)).resolves.toBe(false)
  })
})
