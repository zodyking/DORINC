/** Shared Quo SMS helpers for worker/automation notification paths. */
import { loadQuoConfig } from './app-config.mjs'

const QUO_API_BASE = 'https://api.quo.com'

/** Catalog defaults — keep in sync with shared/sms-template-catalog.ts */
export const SMS_DEFAULT_BODIES = {
  notify_channel_changed: 'Notifications switched to {{channelLabel}}.',
  dorinc_contact_card: 'Save Dorinc to text Susan:\n{{contactUrl}}',
  login_notification: 'New sign-in\n{{when}}\n{{locationLine}}\n{{device}}\nNot you? Change your password.',
  outside_geofence_verification: 'Your code is {{code}}\nExpires in {{expiresMinutes}} min\n{{locationLabel}}',
  signup_verification: 'Verify your email to finish signup.\nThe link expires in 24 hours.',
  chat_message_received: '{{senderName}} · {{channelLabel}}\n{{messagePreview}}{{photoNote}}',
  password_reset: 'Password reset requested.\nCheck email for the link (1 hour).',
  staff_invite: "You're invited\n{{email}}\nTemp password: {{tempPassword}}\nExpires in 7 days",
  staff_password_reset: 'Password reset\n{{email}}\nTemp password: {{tempPassword}}\nExpires in 7 days',
  deletion_request_submitted: 'Delete request · {{entityTypeLabel}}\n{{entityLabel}}\n{{submitterName}} · {{reason}}',
  deletion_request_result: 'Delete request {{statusLabel}}\n{{entityTypeLabel}} · {{entityLabel}}\n{{reviewedByName}}\n{{reviewReason}}',
  user_signup_pending: 'Signup needs approval\n{{userName}}\n{{userEmail}}',
  invoice_pending_approval: 'Invoice needs approval\n{{invoiceNumber}} · {{customerName}}\n{{total}}',
  customer_service_request_staff: 'Service request · {{customerName}}\n{{vehicleUnit}} · {{serviceCategory}} · {{urgency}}\n{{message}}',
  customer_change_request_staff: '{{requestKindLabel}} · {{customerName}}\n{{topic}}\n{{message}}',
  customer_email_received_staff: 'Email from {{customerName}}\n{{subject}}\n{{messagePreview}}',
  daily_summary_report: 'Daily summary for {{reportDateLabel}} is ready.',
  quo_test: 'Quo SMS test\n{{sentAt}}',
}

export function normalizePhoneE164(value) {
  if (value == null) return null
  const trimmed = String(value).trim()
  if (!trimmed) return null
  if (/^\+[1-9]\d{7,14}$/.test(trimmed)) return trimmed
  const digits = trimmed.replace(/\D/g, '')
  if (digits.length === 10) return `+1${digits}`
  if (digits.length === 11 && digits.startsWith('1')) return `+${digits}`
  if (digits.length >= 8 && digits.length <= 15) return `+${digits}`
  return null
}

export async function isQuoSmsEnabled(pool) {
  try {
    const config = await loadQuoConfig(pool)
    if (!config?.enabled || !config.apiKey || !config.fromNumber) return false
    return true
  }
  catch (err) {
    // A settings read failure must not cancel the notification — without this
    // a transient database problem silently dropped chat/staff emails.
    console.warn(
      '[sms-notify] Quo config unavailable; sending by email:',
      err instanceof Error ? err.message : err,
    )
    return false
  }
}

export async function resolveSmsBody(pool, typeKey, vars) {
  const { rows } = await pool.query(
    `SELECT content, is_active FROM sms_templates WHERE type_key = $1 LIMIT 1`,
    [typeKey],
  )
  let body = null
  if (rows[0]?.is_active && rows[0]?.content?.body) {
    body = String(rows[0].content.body)
  }
  if (!body) body = SMS_DEFAULT_BODIES[typeKey] || ''
  return String(body).replace(/\{\{\s*([\w.]+)\s*\}\}/g, (_, key) => {
    const value = vars[key]
    return value == null ? '' : String(value)
  }).trim()
}

/** Fail fast so a hung Quo API cannot stall the worker tick or the app pool. */
export const QUO_FETCH_TIMEOUT_MS = 8_000

/** Send via Quo (sms_send handler only). Never call this on an HTTP request path. */
export async function sendQuoSmsDirect(pool, input) {
  const config = await loadQuoConfig(pool)
  if (!config?.enabled || !config.apiKey || !config.fromNumber) {
    throw new Error('Quo SMS is not enabled')
  }

  const to = normalizePhoneE164(input?.to)
  const from = normalizePhoneE164(config.fromNumber) ?? String(config.fromNumber).trim()
  const content = String(input?.body ?? '').trim()
  if (!to) throw new Error('Invalid destination phone number')
  if (!from) throw new Error('Quo from number is not configured')
  if (!content) throw new Error('SMS body is empty')

  const res = await fetch(`${QUO_API_BASE}/v1/messages`, {
    method: 'POST',
    headers: {
      Authorization: config.apiKey,
      Accept: 'application/json',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      content: content.slice(0, 1600),
      from,
      to: [to],
    }),
    signal: AbortSignal.timeout(QUO_FETCH_TIMEOUT_MS),
  })

  const text = await res.text()
  if (!res.ok) {
    let message = `Quo API error (${res.status})`
    try {
      const body = text ? JSON.parse(text) : null
      if (body?.message) message = String(body.message)
    }
    catch {
      if (text) message = text.slice(0, 200)
    }
    throw new Error(message)
  }
  return true
}

async function queueSmsJob(pool, payload) {
  await pool.query(
    `INSERT INTO worker_jobs (job_type, payload, status, attempts, max_attempts, run_after)
     VALUES ('sms_send', $1, 'queued', 0, 3, now())`,
    [JSON.stringify(payload)],
  )
}

/**
 * Prefer SMS when Quo is on, user channel is sms, and phone is valid.
 * Always queue sms_send — never call Quo inline. Direct Quo from the worker
 * tick (and from the embedded Nitro worker that shares the app DB pool)
 * stalled login/dashboard when api.quo.com hung for SMS-channel users.
 * Falls back to email_send when SMS cannot be queued.
 */
export async function enqueueRecipientNotification(pool, opts) {
  const {
    recipient,
    quoOn,
    smsTypeKey,
    smsVars,
    email,
    meta = {},
  } = opts

  const preferSms = quoOn && recipient.message_notify_channel === 'sms'
  const phone = preferSms ? normalizePhoneE164(recipient.phone) : null

  if (phone && smsTypeKey) {
    const body = await resolveSmsBody(pool, smsTypeKey, smsVars)
    if (body) {
      await queueSmsJob(pool, {
        to: phone,
        body,
        notificationKind: smsTypeKey,
        recipientUserId: recipient.id,
        ...meta,
      })
      return 'sms'
    }
  }

  await pool.query(
    `INSERT INTO worker_jobs (job_type, payload, status, attempts, max_attempts, run_after)
     VALUES ('email_send', $1, 'queued', 0, 3, now())`,
    [JSON.stringify({
      to: recipient.email,
      subject: email.subject,
      text: email.text,
      html: email.html,
      ...(Array.isArray(email.attachmentFileIds) && email.attachmentFileIds.length
        ? { attachmentFileIds: email.attachmentFileIds }
        : {}),
      notificationKind: meta.notificationKind || smsTypeKey || 'staff_notification',
      recipientUserId: recipient.id,
      ...meta,
    })],
  )
  return 'email'
}
