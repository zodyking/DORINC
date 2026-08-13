import { defineNitroPlugin } from 'nitropack/runtime'
import { hasDatabaseConfig } from '../services/runtime-config.service'
import { usePool } from '../db/client'

function embeddedWorkersEnabled(): boolean {
  if (process.env.WORKER_KIND) return false
  if (process.env.EMBEDDED_WORKERS === 'false') return false
  return process.env.EMBEDDED_WORKERS === 'true' || process.env.NODE_ENV === 'production'
}

/**
 * Nitro must not drain IMAP/PDF/AI/SMS/mail/backups on the login Postgres pool.
 * Production already has dedicated pdf + queue workers (see /api/health).
 * This plugin only sends the daily summary, which the plain Node worker cannot
 * load (tsx stack overflow).
 */
export default defineNitroPlugin(() => {
  if (!embeddedWorkersEnabled() || !hasDatabaseConfig()) return

  const pool = usePool()
  const summaryPollMs = Number(process.env.DAILY_SUMMARY_POLL_MS ?? 60_000)
  let summaryTickRunning = false

  const summaryInterval = setInterval(async () => {
    if (summaryTickRunning) return
    summaryTickRunning = true
    try {
      const { isDailySummaryDue } = await import('../workers/handlers/daily-summary.mjs')
      if (!(await isDailySummaryDue(pool))) return
      const { maybeSendScheduledDailySummaryFromPool } = await import('../services/daily-summary.service')
      const result = await maybeSendScheduledDailySummaryFromPool(pool)
      if (result?.sent) {
        console.log(
          `[embedded-worker] daily_summary_report sent=${result.sent} delivered=${result.delivered} failed=${result.failed}`,
        )
      }
    }
    catch (err) {
      console.error('[embedded-worker] daily_summary_report failed', err)
    }
    finally {
      summaryTickRunning = false
    }
  }, summaryPollMs)

  console.log(`[embedded-workers] daily summary only (poll ${summaryPollMs}ms)`)

  const stop = () => {
    clearInterval(summaryInterval)
  }
  process.on('SIGTERM', stop)
  process.on('SIGINT', stop)
})
