/**
 * Periodic Susan how-to SMS for staff on Text notifications.
 * Runs on the dedicated worker only (same skipSms gate as sms_send).
 */
import { sendQuoSmsDirect, isQuoSmsEnabled, normalizePhoneE164 } from '../lib/sms-notify.mjs'
import {
  SUSAN_SMS_HISTORY_LIMIT,
} from '../../../shared/susan-sms-idle.mjs'
import {
  SUSAN_SMS_INTRO_AFTER_IDLE_SECONDS,
  SUSAN_SMS_INTRO_SECONDS,
  formatSusanSmsIntroMessage,
} from '../../../shared/susan-sms-intro.mjs'

const SUSAN_SYSTEM_EMAIL = 'susan.ai@dorinc.system'

const ELIGIBLE_USER_SQL = `
  u.is_active = true
  AND u.disabled_at IS NULL
  AND u.approved_at IS NOT NULL
  AND COALESCE(u.silent_developer_mode, false) = false
  AND at.key <> 'customer'
  AND u.message_notify_channel = 'sms'
  AND u.phone IS NOT NULL AND btrim(u.phone) <> ''
  AND lower(u.email) <> '${SUSAN_SYSTEM_EMAIL}'
`

/**
 * @param {import('pg').PoolClient} client
 * @param {string} body
 * @param {string} iso
 */
async function claimExistingThread(client, body, iso) {
  const { rows } = await client.query(
    `SELECT t.id, t.user_id, t.phone, t.messages, u.phone AS user_phone,
            t.last_user_at, t.last_intro_at, t.idle_closed_at, t.opted_out_at
     FROM susan_sms_threads t
     INNER JOIN users u ON u.id = t.user_id
     INNER JOIN account_types at ON at.id = u.account_type_id
     WHERE ${ELIGIBLE_USER_SQL}
       AND t.opted_out_at IS NULL
       AND (t.last_intro_at IS NULL OR t.last_intro_at <= now() - make_interval(secs => $1))
       AND (t.last_user_at IS NULL OR t.last_user_at <= now() - make_interval(secs => $1))
       AND (t.idle_closed_at IS NULL OR t.idle_closed_at <= now() - make_interval(secs => $2))
     ORDER BY t.last_intro_at NULLS FIRST, t.updated_at ASC
     LIMIT 1
     FOR UPDATE OF t SKIP LOCKED`,
    [SUSAN_SMS_INTRO_SECONDS, SUSAN_SMS_INTRO_AFTER_IDLE_SECONDS],
  )
  const thread = rows[0]
  if (!thread) return null

  const phone = normalizePhoneE164(thread.user_phone || thread.phone)
  const messages = Array.isArray(thread.messages) ? thread.messages : []
  const nextMessages = phone
    ? [...messages, { role: 'assistant', content: body, at: iso }].slice(-SUSAN_SMS_HISTORY_LIMIT)
    : messages

  await client.query(
    `UPDATE susan_sms_threads
     SET last_intro_at = now(),
         phone = COALESCE($2, phone),
         messages = $3::jsonb,
         updated_at = now()
     WHERE id = $1`,
    [thread.id, phone, JSON.stringify(nextMessages)],
  )
  if (!phone) return null
  return { id: thread.id, phone, body }
}

/**
 * @param {import('pg').PoolClient} client
 * @param {string} body
 * @param {string} iso
 */
async function claimNewThread(client, body, iso) {
  const { rows } = await client.query(
    `SELECT u.id AS user_id, u.phone AS user_phone
     FROM users u
     INNER JOIN account_types at ON at.id = u.account_type_id
     LEFT JOIN susan_sms_threads t ON t.user_id = u.id
     WHERE ${ELIGIBLE_USER_SQL}
       AND t.id IS NULL
     ORDER BY u.created_at ASC
     LIMIT 1
     FOR UPDATE OF u SKIP LOCKED`,
  )
  const user = rows[0]
  if (!user) return null

  const rawPhone = String(user.user_phone || '').trim()
  const phone = normalizePhoneE164(rawPhone)
  const messages = phone ? [{ role: 'assistant', content: body, at: iso }] : []
  const inserted = await client.query(
    `INSERT INTO susan_sms_threads (
       user_id, phone, messages, last_intro_at, created_at, updated_at
     ) VALUES ($1, $2, $3::jsonb, now(), now(), now())
     ON CONFLICT (user_id) DO NOTHING
     RETURNING id`,
    [user.user_id, phone || rawPhone, JSON.stringify(messages)],
  )
  const id = inserted.rows[0]?.id
  if (!id || !phone) return null
  return { id, phone, body }
}

/**
 * @param {import('pg').Pool} pool
 * @param {number} [batch]
 * @returns {Promise<{ processed: number, failed: number }>}
 */
export async function processSusanSmsIntros(pool, batch = 20) {
  let processed = 0
  let failed = 0

  if (!(await isQuoSmsEnabled(pool))) {
    return { processed, failed }
  }

  const body = formatSusanSmsIntroMessage()

  for (let i = 0; i < batch; i++) {
    const client = await pool.connect()
    /** @type {{ id: string, phone: string, body: string } | null} */
    let claimed = null
    try {
      await client.query('BEGIN')
      const iso = new Date().toISOString()
      claimed = await claimExistingThread(client, body, iso)
        || await claimNewThread(client, body, iso)
      await client.query('COMMIT')
    }
    catch (err) {
      await client.query('ROLLBACK').catch(() => {})
      failed++
      console.warn(
        '[susan-sms-intro] claim failed',
        err instanceof Error ? err.message : err,
      )
    }
    finally {
      client.release()
    }

    if (!claimed) break

    try {
      await sendQuoSmsDirect(pool, { to: claimed.phone, body: claimed.body })
      processed++
    }
    catch (err) {
      failed++
      console.warn(
        '[susan-sms-intro] send failed',
        claimed.id,
        err instanceof Error ? err.message : err,
      )
    }
  }

  return { processed, failed }
}
