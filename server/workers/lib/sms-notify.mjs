/** Shared Quo SMS helpers for worker/automation notification paths. */
import { loadQuoConfig } from './app-config.mjs'

const QUO_API_BASE = 'https://api.quo.com'

/** Catalog defaults — keep in sync with shared/sms-template-catalog.ts */
export const SMS_DEFAULT_BODIES = {
  login_notification: "{{brandName}}\n\nHi {{name}},\n\nNew sign-in\n\nYour staff account was used to sign in to {{brandName}}.\n\nWhen: {{when}}\nEmail: {{email}}\nLocation: {{locationLine}}\nIP address: {{ipAddress}}\nDevice: {{device}}\n\nIf this was not you, contact your administrator immediately and change your password.\nOpen: {{appUrl}}",
  outside_geofence_verification: "{{brandName}}\n\nHi {{name}},\n\nSuspicious location detected\n\nYou're accessing {{brandName}} from a suspicious location. Enter this verification code to confirm your identity.\n\nVerification code: {{code}}\nExpires: {{expiresMinutes}} minutes\nLocation: {{locationLabel}}\nIP address: {{ipAddress}}\n\nIf you did not attempt to sign in, contact your administrator immediately and change your password.",
  signup_verification: "{{brandName}}\n\nHi {{name}},\n\nVerify your email\n\nConfirm your email to continue your {{brandName}} account request.\n\nVerify: {{verifyUrl}}\n\nThe link expires in 24 hours. After verification an administrator must approve your account before you can sign in.",
  chat_message_received: "{{brandName}}\n\nHi {{recipientName}},\n\n{{senderName}} sent a message\n\nYou received a new message in {{channelLabel}}.\n\n{{messagePreview}}\n\nOpen message: {{messagesUrl}}",
  password_reset: "{{brandName}}\n\nHi {{name}},\n\nReset your password\n\nWe received a request to reset your {{brandName}} staff password.\n\nReset: {{resetUrl}}\n\nThe link expires in 1 hour. If you did not request this, you can ignore this message — your password will not change unless you use the link.",
  staff_invite: "{{brandName}}\n\nHello {{name}},\n\nWelcome to the team\n\nYou've been invited to join the {{brandName}} staff workspace. Sign in with the credentials below, then choose your own password.\n\nSign in: {{loginUrl}}\nEmail: {{email}}\nTemporary password: {{tempPassword}}\n\nYour email is already verified. Choose a new password when you sign in for the first time.\nThis temporary password expires in 7 days.",
  staff_password_reset: "{{brandName}}\n\nHello {{name}},\n\nPassword reset\n\nAn administrator reset your {{brandName}} staff password. Sign in with the temporary password below, then choose a new one.\n\nSign in: {{loginUrl}}\nEmail: {{email}}\nTemporary password: {{tempPassword}}\n\nAfter any required login messages, you will be asked to choose a new password before continuing.\nThis temporary password expires in 7 days.",
  deletion_request_submitted: "{{brandName}}\n\nHi {{reviewerName}},\n\nDeletion request\n\n{{submitterName}} requested deletion of a {{entityTypeLabel}}.\n\nRecord: {{entityLabel}}\nType: {{entityTypeLabel}}\nRequested by: {{submitterName}}\n\nReason for deletion:\n{{reason}}\n\nReview: {{reviewUrl}}",
  deletion_request_result: "{{brandName}}\n\nHi {{requestorName}},\n\nDeletion request\n\nYour deletion request for {{entityTypeLabel}} \"{{entityLabel}}\" has been reviewed.\n\nRecord: {{entityLabel}}\nType: {{entityTypeLabel}}\nDecision: {{statusLabel}}\nReviewed by: {{reviewedByName}}\n\nReviewer note:\n{{reviewReason}}\n\n{{detailLine}}",
  user_signup_pending: "{{brandName}}\n\nHi {{adminName}},\n\nNew user awaiting approval\n\nA staff signup finished email verification and needs an administrator to approve the account.\n\nName: {{userName}}\nEmail: {{userEmail}}\nStatus: Pending approval\n\nReview users: {{usersUrl}}",
  invoice_pending_approval: "{{brandName}}\n\nHi {{approverName}},\n\nInvoice needs approval\n\nInvoice {{invoiceNumber}} for {{customerName}} is waiting for manager approval.\n\nInvoice: {{invoiceNumber}}\nCustomer: {{customerName}}\nTotal: {{total}}\n\nReview: {{invoiceUrl}}",
  customer_service_request_staff: "{{brandName}}\n\nHi {{recipientName}},\n\nNew customer service request\n\n{{customerName}} submitted a service request. Check the portal for full details and next steps.\n\nCustomer: {{customerName}}\nVehicle: {{vehicleUnit}}\nDetails: {{vehicleDetails}}\nCategory: {{serviceCategory}}\nUrgency: {{urgency}}\n\nCustomer message:\n{{message}}\n\nOpen: {{detailUrl}}",
  customer_change_request_staff: "{{brandName}}\n\nHi {{recipientName}},\n\nNew customer change request\n\n{{customerName}} submitted a {{requestKindLabel}}.\n\nCustomer: {{customerName}}\nRequest type: {{requestKindLabel}}\nTopic: {{topic}}\nInvoice: {{invoiceNumber}}\nVehicle: {{vehicleLabel}}\n\nCustomer message:\n{{message}}\n\nReview: {{detailUrl}}",
  customer_email_received_staff: "{{brandName}}\n\nHi {{recipientName}},\n\n{{customerName}} sent a message\n\n{{customerName}} emailed your company inbox. Sign in, open Messages, and reply.\n\nCustomer: {{customerName}}\nEmail: {{customerEmail}}\nSubject: {{subject}}\n\n{{messagePreview}}\n\nOpen Messages: {{messagesUrl}}",
  daily_summary_report: "{{brandName}}\n\nHi {{recipientName}},\n\nDaily summary: {{reportDateLabel}}\n\nStats for {{reportDateLabel}} are ready, with notes from Susan AI Assistant under each section.\n\nOpen summary: {{summaryUrl}}",
  quo_test: "{{brandName}}\n\nHi {{name}},\n\nQuo SMS test successful\n\nThis is a test message from the {{brandName}} control panel.\n\nSent at: {{sentAt}}\n\nIf you received this, outbound Quo SMS is working correctly.",
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

/** Send via Quo immediately (same API shape as Control Panel test SMS). */
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
 * Sends to Quo immediately (like test SMS); queues a retry only if direct send fails.
 * Falls back to email_send when SMS cannot be delivered.
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
      const payload = {
        to: phone,
        body,
        notificationKind: smsTypeKey,
        recipientUserId: recipient.id,
        ...meta,
      }
      try {
        await sendQuoSmsDirect(pool, payload)
        return 'sms'
      }
      catch (err) {
        console.warn(
          `[sms-notify] direct Quo send failed for ${smsTypeKey}; queueing retry:`,
          err instanceof Error ? err.message : err,
        )
        await queueSmsJob(pool, payload)
        return 'sms'
      }
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
