/** Shared Quo SMS helpers for worker/automation notification paths. */
import { loadQuoConfig } from './app-config.mjs'

/** Catalog defaults — keep in sync with shared/sms-template-catalog.ts */
export const SMS_DEFAULT_BODIES = {
  login_notification: '{{brandName}}: New sign-in for {{name}}. {{locationLine}} If this wasn\'t you, reset your password in the app.',
  outside_geofence_verification: '{{brandName}} verification code: {{code}}. Expires in {{expiresMinutes}} min. Do not share this code.',
  signup_verification: '{{brandName}}: Confirm your account for {{name}}. Open {{verifyUrl}} to verify.',
  chat_message_received: '{{brandName}}: {{senderName}} in {{channelLabel}}: "{{messagePreview}}" — {{messagesUrl}}',
  password_reset: '{{brandName}}: Reset your password here: {{resetUrl}} (expires soon). Ignore if you didn\'t request this.',
  staff_invite: '{{brandName}}: You\'re invited, {{name}}. Sign in at {{loginUrl}} as {{email}}. Temp password: {{tempPassword}}. Change it after login.',
  staff_password_reset: '{{brandName}}: Password reset for {{name}}. Temp password: {{tempPassword}}. Sign in at {{loginUrl}} and change it immediately.',
  deletion_request_submitted: '{{brandName}}: Deletion request from {{submitterName}} for {{entityTypeLabel}} "{{entityLabel}}". Review: {{reviewUrl}}',
  deletion_request_result: '{{brandName}}: Your deletion request for {{entityTypeLabel}} "{{entityLabel}}" was {{status}}. {{detailLine}}',
  user_signup_pending: '{{brandName}}: {{userName}} ({{userEmail}}) requested access. Review: {{usersUrl}}',
  invoice_pending_approval: '{{brandName}}: Invoice {{invoiceNumber}} for {{customerName}} ({{total}}) needs approval. {{invoiceUrl}}',
  customer_service_request_staff: '{{brandName}}: Service request from {{customerName}} — {{vehicleUnit}} ({{urgency}}). {{detailUrl}}',
  customer_change_request_staff: '{{brandName}}: {{requestKindLabel}} from {{customerName}}: {{topic}}. {{detailUrl}}',
  customer_email_received_staff: '{{brandName}}: Email from {{customerName}} <{{customerEmail}}>: "{{subject}}". {{messagesUrl}}',
  daily_summary_report: '{{brandName}}: Daily summary for {{reportDateLabel}} is ready. Open: {{summaryUrl}}',
  quo_test: '{{brandName}}: Quo SMS test OK at {{sentAt}}.',
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
  const config = await loadQuoConfig(pool)
  if (!config?.enabled || !config.apiKey || !config.fromNumber) return false
  return true
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

/**
 * Prefer SMS when Quo is on, user channel is sms, and phone is valid.
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
      await pool.query(
        `INSERT INTO worker_jobs (job_type, payload, status, attempts, max_attempts, run_after)
         VALUES ('sms_send', $1, 'queued', 0, 3, now())`,
        [JSON.stringify({
          to: phone,
          body,
          notificationKind: smsTypeKey,
          recipientUserId: recipient.id,
          ...meta,
        })],
      )
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
      notificationKind: smsTypeKey || meta.notificationKind || 'staff_notification',
      recipientUserId: recipient.id,
      ...meta,
    })],
  )
  return 'email'
}
