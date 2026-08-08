/**
 * Daily summary helpers for worker processes (SQL-only).
 *
 * The dedicated worker image must never load `tsx` or TypeScript services —
 * repeated `tsImport()` registration caused:
 *   RangeError: Maximum call stack size exceeded
 * in Node module customization hooks.
 *
 * Scheduled delivery runs from the Nitro embedded worker
 * (`server/plugins/background-workers.ts`) which can import the TS service.
 */

const NOTIFICATION_SETTINGS_KEY = 'workspace.notification_settings'
const LAST_SENT_SETTING_KEY = 'system.daily_summary_last_sent'
const DEFAULT_SEND_HOUR_UTC = 13

function todayIsoDate(now = new Date()) {
  return now.toISOString().slice(0, 10)
}

/**
 * Cheap SQL-only due check (enabled + UTC hour + not already sent today).
 * @param {import('pg').Pool} pool
 * @param {Date} [now]
 */
export async function isDailySummaryDue(pool, now = new Date()) {
  const { rows } = await pool.query(
    `SELECT value FROM app_settings WHERE key = $1 LIMIT 1`,
    [NOTIFICATION_SETTINGS_KEY],
  )
  const settings = rows[0]?.value || {}
  if (settings.dailySummaryReport === false) return false

  const hourRaw = settings.dailySummarySendHourUtc
  const hour = Number.isInteger(hourRaw) ? hourRaw : DEFAULT_SEND_HOUR_UTC
  if (now.getUTCHours() !== hour) return false

  const reportDate = todayIsoDate(now)
  const last = await pool.query(
    `SELECT value FROM app_settings WHERE key = $1 LIMIT 1`,
    [LAST_SENT_SETTING_KEY],
  )
  const lastDate = String(last.rows[0]?.value?.date ?? '').trim()
  return lastDate !== reportDate
}

/**
 * @deprecated Kept for import compatibility. Always returns false — scheduled
 * sends are handled by the Nitro embedded worker, not the plain Node worker.
 * @param {import('pg').Pool} [_pool]
 * @returns {Promise<boolean>}
 */
export async function maybeEnqueueDailySummary() {
  return false
}
