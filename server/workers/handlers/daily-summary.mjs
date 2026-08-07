// Daily summary report — schedule check + send via TS service (tsx).
import { tsImport } from 'tsx/esm/api'

/**
 * @param {import('pg').Pool} pool
 * @returns {Promise<boolean>} true when a send was attempted (or already handled for the hour)
 */
export async function maybeEnqueueDailySummary(pool) {
  const mod = await tsImport(
    new URL('../../services/daily-summary.service.ts', import.meta.url).href,
    import.meta.url,
  )
  const result = await mod.maybeSendScheduledDailySummaryFromPool(pool)
  if (!result) return false
  if (result.sent > 0) {
    console.log(`[daily-summary] queued ${result.sent} email(s) for ${result.reportDate}`)
    return true
  }
  if (result.skipped && result.skipped !== 'already_sent_today') {
    console.log(`[daily-summary] skipped: ${result.skipped}`)
  }
  return Boolean(result.sent)
}
