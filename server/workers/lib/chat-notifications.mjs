/** Queue chat message email/SMS notifications from worker/automation paths. */
import { buildChatMessageReceivedEmail } from '../../mail/templates/system.mjs'
import { loadActiveEmailTemplateContent } from '../../mail/email-template-override.mjs'
import { TEAM_CHAT_TITLE } from './team-chat.mjs'
import { loadQuoConfig } from './app-config.mjs'

const ENTITY_REF_TOKEN_RE = /\[\[ref:([a-z_]+):([0-9a-f-]{36}):([^\]]+)\]\]/gi

function messagePreview(body) {
  const stripped = String(body ?? '').replace(ENTITY_REF_TOKEN_RE, (_match, _type, _id, label) => label)
  return stripped.length > 120 ? `${stripped.slice(0, 117)}…` : stripped
}

function normalizePhoneE164(value) {
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

async function loadEmailBrand(pool) {
  const appUrl = process.env.APP_URL?.trim()?.replace(/\/$/, '') || 'http://localhost:3000'
  const { rows } = await pool.query(
    `SELECT value FROM app_settings WHERE key = 'workspace.business_profile' LIMIT 1`,
  )
  const profile = rows[0]?.value || {}
  const brandName = String(profile.businessName ?? profile.tradeName ?? profile.legalName ?? 'Devon On Site Repairs').trim()
    || 'Devon On Site Repairs'
  return {
    brandName,
    brandLegal: brandName,
    brandTagline: String(profile.tagline ?? '').trim(),
    logoUrl: `${appUrl}/images/dorinc-icon-trans.png`,
    logoInitial: (brandName.charAt(0) || 'D').toUpperCase(),
    appUrl,
    settingsUrl: `${appUrl}/admin?tab=notifications`,
    helpUrl: `${appUrl}/help`,
    signInUrl: `${appUrl}/auth/login`,
  }
}

async function isQuoSmsEnabled(pool) {
  const config = await loadQuoConfig(pool)
  if (!config?.enabled || !config.apiKey || !config.fromNumber) return false
  return true
}

async function resolveSmsBody(pool, typeKey, vars) {
  const { rows } = await pool.query(
    `SELECT content, is_active FROM sms_templates WHERE type_key = $1 LIMIT 1`,
    [typeKey],
  )
  let body = null
  if (rows[0]?.is_active && rows[0]?.content?.body) {
    body = String(rows[0].content.body)
  }
  if (!body) {
    const defaults = {
      chat_message_received: '{{brandName}}: {{senderName}} in {{channelLabel}}: "{{messagePreview}}" — {{messagesUrl}}',
    }
    body = defaults[typeKey] || ''
  }
  return String(body).replace(/\{\{\s*([\w.]+)\s*\}\}/g, (_, key) => {
    const value = vars[key]
    return value == null ? '' : String(value)
  }).trim()
}

/**
 * @param {import('pg').Pool} pool
 * @param {{
 *   conversationId: string
 *   messageId: string
 *   senderUserId: string
 *   body: string
 *   isTeamChat?: boolean
 * }} opts
 */
export async function notifyChatMessageReceivedWorker(pool, opts) {
  const { rows: conversationRows } = await pool.query(
    `SELECT type, title FROM conversations WHERE id = $1 LIMIT 1`,
    [opts.conversationId],
  )
  const conversation = conversationRows[0]
  if (!conversation) return { queued: 0, reason: 'conversation_not_found' }

  const { rows: senderRows } = await pool.query(
    `SELECT name FROM users WHERE id = $1 LIMIT 1`,
    [opts.senderUserId],
  )
  const senderName = senderRows[0]?.name ?? 'Staff'

  const { rows: participantRows } = await pool.query(
    `SELECT user_id FROM conversation_participants
     WHERE conversation_id = $1 AND user_id <> $2`,
    [opts.conversationId, opts.senderUserId],
  )
  if (!participantRows.length) return { queued: 0, reason: 'no_participants' }

  const recipientIds = participantRows.map(row => row.user_id)
  const quoOn = await isQuoSmsEnabled(pool)
  const { rows: recipients } = await pool.query(
    `SELECT id, name, email, phone, message_notify_channel, message_email_notify
     FROM users
     WHERE id = ANY($1::uuid[])
       AND is_active = true
       AND approved_at IS NOT NULL
       AND email IS NOT NULL
       AND btrim(email) <> ''
       AND ($2::boolean = true OR message_email_notify = true)`,
    [recipientIds, quoOn],
  )
  if (!recipients.length) return { queued: 0, reason: 'no_recipients' }

  const brand = await loadEmailBrand(pool)
  const base = brand.appUrl.replace(/\/$/, '')
  const messagesUrl = `${base}/messages?conversation=${opts.conversationId}`
  const preview = messagePreview(opts.body)
  const isTeamChat = opts.isTeamChat === true || conversation.type === 'team'
  const channelLabel = isTeamChat
    ? (conversation.title?.trim() || TEAM_CHAT_TITLE)
    : 'Direct message'

  const templateOverride = await loadActiveEmailTemplateContent(pool, 'chat_message_received')
  let queued = 0
  for (const recipient of recipients) {
    const preferSms = quoOn && recipient.message_notify_channel === 'sms'
    const phone = preferSms ? normalizePhoneE164(recipient.phone) : null

    if (phone) {
      const body = await resolveSmsBody(pool, 'chat_message_received', {
        brandName: brand.brandName,
        appUrl: brand.appUrl,
        senderName,
        channelLabel,
        messagePreview: preview,
        messagesUrl,
        recipientName: recipient.name || 'Team member',
      })
      if (body) {
        await pool.query(
          `INSERT INTO worker_jobs (job_type, payload, status, attempts, max_attempts, run_after)
           VALUES ('sms_send', $1, 'queued', 0, 3, now())`,
          [JSON.stringify({
            to: phone,
            body,
            notificationKind: 'chat_message_received',
            conversationId: opts.conversationId,
            messageId: opts.messageId,
            recipientUserId: recipient.id,
          })],
        )
        queued++
        continue
      }
    }

    const mail = buildChatMessageReceivedEmail({
      recipientName: recipient.name || 'Team member',
      senderName,
      channelLabel,
      messagePreview: preview,
      messagesUrl,
      appUrl: brand.appUrl,
      brand,
      isTeamChat,
      templateOverride,
    })

    await pool.query(
      `INSERT INTO worker_jobs (job_type, payload, status, attempts, max_attempts, run_after)
       VALUES ('email_send', $1, 'queued', 0, 3, now())`,
      [JSON.stringify({
        to: recipient.email,
        subject: mail.subject,
        text: mail.text,
        html: mail.html,
        notificationKind: 'chat_message_received',
        conversationId: opts.conversationId,
        messageId: opts.messageId,
        recipientUserId: recipient.id,
      })],
    )
    queued++
  }

  return { queued }
}
