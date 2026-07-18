/** Queue chat message email notifications from worker/automation paths. */
import { buildChatMessageReceivedEmail } from '../../mail/templates/system.mjs'
import { TEAM_CHAT_TITLE } from './team-chat.mjs'

const ENTITY_REF_TOKEN_RE = /\[\[ref:([a-z_]+):([0-9a-f-]{36}):([^\]]+)\]\]/gi

function messagePreview(body) {
  const stripped = String(body ?? '').replace(ENTITY_REF_TOKEN_RE, (_match, _type, _id, label) => label)
  return stripped.length > 120 ? `${stripped.slice(0, 117)}…` : stripped
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
  const { rows: recipients } = await pool.query(
    `SELECT id, name, email
     FROM users
     WHERE id = ANY($1::uuid[])
       AND is_active = true
       AND approved_at IS NOT NULL
       AND message_email_notify = true
       AND email IS NOT NULL
       AND btrim(email) <> ''`,
    [recipientIds],
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

  let queued = 0
  for (const recipient of recipients) {
    const mail = buildChatMessageReceivedEmail({
      recipientName: recipient.name || 'Team member',
      senderName,
      channelLabel,
      messagePreview: preview,
      messagesUrl,
      appUrl: brand.appUrl,
      brand,
      isTeamChat,
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
