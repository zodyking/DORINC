/** Queue chat message email/SMS notifications from worker/automation paths. */
import { buildChatMessageReceivedEmail } from '../../mail/templates/system.mjs'
import { escapeHtml } from '../../mail/email-layout.mjs'
import { loadActiveEmailTemplateContent } from '../../mail/email-template-override.mjs'
import { TEAM_CHAT_TITLE } from './team-chat.mjs'
import {
  enqueueRecipientNotification,
  isQuoSmsEnabled,
} from './sms-notify.mjs'

const ENTITY_REF_TOKEN_RE = /\[\[ref:([a-z_]+):([0-9a-f-]{36}):([^\]]+)\]\]/gi

/** Full chat body for notifications (entity refs → labels, no truncation). */
function formatChatNotifyBody(body) {
  return String(body ?? '')
    .replace(ENTITY_REF_TOKEN_RE, (_match, _type, _id, label) => label)
    .trim()
}

function buildInlineImageHtml(images) {
  const imageAtts = (images || []).filter(a => String(a.mime_type || a.mimeType || '').startsWith('image/'))
  const attachmentFileIds = imageAtts.map((a, i) => ({
    fileId: a.id,
    cid: `chat-img-${i + 1}@dorinc`,
    filename: a.original_filename || a.filename || `image-${i + 1}`,
    contentType: a.mime_type || a.mimeType,
  }))
  const imagesHtml = attachmentFileIds.map((a) => {
    const alt = escapeHtml(a.filename)
    return `<img src="cid:${a.cid}" alt="${alt}" style="max-width:100%;height:auto;border-radius:8px;display:block;margin:0 0 10px 0;" />`
  }).join('')
  return { imagesHtml, attachmentFileIds }
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
  const fullMessage = formatChatNotifyBody(opts.body)
  // Attachments are decoration — a failed lookup must not cancel the whole
  // notification, which previously dropped the chat email entirely.
  let attachmentRows = []
  try {
    const attachments = await pool.query(
      `SELECT id, original_filename, mime_type
       FROM app_files
       WHERE owner_entity_type = 'message'
         AND owner_entity_id = $1
         AND file_kind = 'attachment'
         AND archived_at IS NULL
       ORDER BY created_at ASC`,
      [opts.messageId],
    )
    attachmentRows = attachments.rows ?? []
  }
  catch (err) {
    console.warn(
      '[chat-notify] attachment lookup failed; sending without photos:',
      err instanceof Error ? err.message : err,
    )
  }
  const { imagesHtml, attachmentFileIds } = buildInlineImageHtml(attachmentRows)
  const photoNote = attachmentFileIds.length
    ? `${attachmentFileIds.length === 1
      ? 'Photo attached — open the message to view.'
      : `${attachmentFileIds.length} photos attached — open the message to view.`}\n\n`
    : ''
  const isTeamChat = opts.isTeamChat === true || conversation.type === 'team'
  const channelLabel = isTeamChat
    ? (conversation.title?.trim() || TEAM_CHAT_TITLE)
    : 'Direct message'

  const templateOverride = await loadActiveEmailTemplateContent(pool, 'chat_message_received')
  let queued = 0
  for (const recipient of recipients) {
    const mail = buildChatMessageReceivedEmail({
      recipientName: recipient.name || 'Team member',
      senderName,
      channelLabel,
      messagePreview: fullMessage,
      imagesHtml,
      messagesUrl,
      appUrl: brand.appUrl,
      brand,
      isTeamChat,
      templateOverride,
    })

    await enqueueRecipientNotification(pool, {
      recipient,
      quoOn,
      smsTypeKey: 'chat_message_received',
      smsVars: {
        brandName: brand.brandName,
        appUrl: brand.appUrl,
        senderName,
        channelLabel,
        messagePreview: fullMessage,
        photoNote,
        messagesUrl,
        recipientName: recipient.name || 'Team member',
      },
      email: {
        ...mail,
        attachmentFileIds,
      },
      meta: {
        conversationId: opts.conversationId,
        messageId: opts.messageId,
      },
    })
    queued++
  }

  return { queued }
}
