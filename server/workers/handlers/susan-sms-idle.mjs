/**
 * Close idle Susan SMS chats after 5 minutes of no staff reply.
 * Runs on the dedicated worker only (same skipSms gate as sms_send).
 */
import { sendQuoSmsDirect, isQuoSmsEnabled } from '../lib/sms-notify.mjs'
import {
  SUSAN_SMS_HISTORY_LIMIT,
  SUSAN_SMS_IDLE_SECONDS,
  formatSusanSmsIdleTimeoutMessage,
  lastSusanSmsUserText,
  topicForSusanSmsIdle,
} from '../../../shared/susan-sms-idle.mjs'

/**
 * @param {import('pg').Pool} pool
 * @param {number} [batch]
 * @returns {Promise<{ processed: number, failed: number }>}
 */
export async function processSusanSmsIdleTimeouts(pool, batch = 20) {
  let processed = 0
  let failed = 0

  if (!(await isQuoSmsEnabled(pool))) {
    return { processed, failed }
  }

  for (let i = 0; i < batch; i++) {
    const client = await pool.connect()
    /** @type {{ id: string, phone: string, body: string } | null} */
    let claimed = null
    try {
      await client.query('BEGIN')
      const { rows } = await client.query(
        `SELECT id, phone, messages, pending_action
         FROM susan_sms_threads
         WHERE last_user_at IS NOT NULL
           AND idle_closed_at IS NULL
           AND last_user_at <= now() - make_interval(secs => $1)
         ORDER BY last_user_at ASC
         LIMIT 1
         FOR UPDATE SKIP LOCKED`,
        [SUSAN_SMS_IDLE_SECONDS],
      )
      const thread = rows[0]
      if (!thread) {
        await client.query('COMMIT')
        break
      }

      const messages = Array.isArray(thread.messages) ? thread.messages : []
      const body = formatSusanSmsIdleTimeoutMessage(
        topicForSusanSmsIdle(thread.pending_action, lastSusanSmsUserText(messages)),
      )
      const nextMessages = [
        ...messages,
        { role: 'assistant', content: body, at: new Date().toISOString() },
      ].slice(-SUSAN_SMS_HISTORY_LIMIT)

      await client.query(
        `UPDATE susan_sms_threads
         SET idle_closed_at = now(),
             pending_action = NULL,
             messages = $2::jsonb,
             updated_at = now()
         WHERE id = $1`,
        [thread.id, JSON.stringify(nextMessages)],
      )
      claimed = { id: thread.id, phone: thread.phone, body }
      await client.query('COMMIT')
    }
    catch (err) {
      await client.query('ROLLBACK').catch(() => {})
      failed++
      console.warn(
        '[susan-sms-idle] claim failed',
        err instanceof Error ? err.message : err,
      )
    }
    finally {
      client.release()
    }

    if (!claimed) continue

    try {
      await sendQuoSmsDirect(pool, { to: claimed.phone, body: claimed.body })
      processed++
    }
    catch (err) {
      failed++
      console.warn(
        '[susan-sms-idle] send failed',
        claimed.id,
        err instanceof Error ? err.message : err,
      )
    }
  }

  return { processed, failed }
}
