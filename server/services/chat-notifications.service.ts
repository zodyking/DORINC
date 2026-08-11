import { and, eq, inArray, isNotNull, ne } from 'drizzle-orm'
import type { Db } from '../db/client'
import { users } from '../db/schema/auth'
import { conversationParticipants, conversations } from '../db/schema/messages'
import { buildChatMessageReceivedEmail } from '../mail/templates/system.mjs'
import { escapeHtml } from '../mail/email-layout.mjs'
import { getAppUrl } from './app-config.service'
import { formatChatNotifyBody } from './messages.service'
import { listAttachmentsByMessageIds } from './message-attachments.service'
import { resolveEmailBrand } from './email-branding.service'
import { TEAM_CHAT_TITLE } from './team-chat.service'
import { isQuoEnabled } from './quo.service'
import { deliverUserNotification } from './notify-delivery.service'

function buildInlineImageHtml(
  images: Array<{ id: string, filename: string, mimeType: string }>,
): { imagesHtml: string, attachmentFileIds: Array<{ fileId: string, cid: string, filename: string, contentType: string }> } {
  const imageAtts = images.filter(a => String(a.mimeType || '').startsWith('image/'))
  const attachmentFileIds = imageAtts.map((a, i) => ({
    fileId: a.id,
    cid: `chat-img-${i + 1}@dorinc`,
    filename: a.filename || `image-${i + 1}`,
    contentType: a.mimeType,
  }))
  const imagesHtml = attachmentFileIds.map((a) => {
    const alt = escapeHtml(a.filename)
    return `<img src="cid:${a.cid}" alt="${alt}" style="max-width:100%;height:auto;border-radius:8px;display:block;margin:0 0 10px 0;" />`
  }).join('')
  return { imagesHtml, attachmentFileIds }
}

export async function notifyChatMessageReceived(
  db: Db,
  opts: {
    conversationId: string
    messageId: string
    senderUserId: string
    body: string
    isTeamChat?: boolean
  },
) {
  const [conversation] = await db.select({
    type: conversations.type,
    title: conversations.title,
  })
    .from(conversations)
    .where(eq(conversations.id, opts.conversationId))
    .limit(1)
  if (!conversation) return { queued: 0 as const }

  const [sender] = await db.select({ name: users.name })
    .from(users)
    .where(eq(users.id, opts.senderUserId))
    .limit(1)
  const senderName = sender?.name ?? 'Staff'

  const participantRows = await db.select({ userId: conversationParticipants.userId })
    .from(conversationParticipants)
    .where(and(
      eq(conversationParticipants.conversationId, opts.conversationId),
      ne(conversationParticipants.userId, opts.senderUserId),
    ))

  if (!participantRows.length) return { queued: 0 as const }

  const recipientIds = participantRows.map(r => r.userId)
  const quoOn = await isQuoEnabled(db)
  const recipients = await db.select({
    id: users.id,
    name: users.name,
    email: users.email,
    phone: users.phone,
    messageNotifyChannel: users.messageNotifyChannel,
    messageEmailNotify: users.messageEmailNotify,
  })
    .from(users)
    .where(and(
      inArray(users.id, recipientIds),
      eq(users.isActive, true),
      isNotNull(users.approvedAt),
      // When Quo is off, keep the classic email opt-in. When Quo is on, channel choice replaces it.
      ...(quoOn ? [] : [eq(users.messageEmailNotify, true)]),
    ))

  if (!recipients.length) return { queued: 0 as const }

  const brand = await resolveEmailBrand(db)
  const { getActiveEmailTemplateContent } = await import('./email-templates.service')
  const templateOverride = await getActiveEmailTemplateContent(db, 'chat_message_received')
  const appUrl = brand.appUrl || getAppUrl()
  const base = appUrl.replace(/\/$/, '')
  const messagesUrl = `${base}/messages?conversation=${opts.conversationId}`
  const fullMessage = formatChatNotifyBody(opts.body)
  const attachmentsByMessage = await listAttachmentsByMessageIds(db, [opts.messageId])
  const { imagesHtml, attachmentFileIds } = buildInlineImageHtml(
    attachmentsByMessage.get(opts.messageId) ?? [],
  )
  const photoNote = attachmentFileIds.length
    ? `${attachmentFileIds.length === 1
      ? 'Photo attached — open the message to view.'
      : `${attachmentFileIds.length} photos attached — open the message to view.`}\n\n`
    : ''
  const channelLabel = opts.isTeamChat || conversation.type === 'team'
    ? (conversation.title ?? TEAM_CHAT_TITLE)
    : 'Direct message'

  let queued = 0
  for (const recipient of recipients) {
    const mail = buildChatMessageReceivedEmail({
      recipientName: recipient.name,
      senderName,
      channelLabel,
      messagePreview: fullMessage,
      imagesHtml,
      messagesUrl,
      appUrl,
      brand,
      isTeamChat: opts.isTeamChat || conversation.type === 'team',
      templateOverride,
    })
    const result = await deliverUserNotification(db, recipient, {
      requireChatOptIn: !quoOn,
      sms: {
        typeKey: 'chat_message_received',
        vars: {
          senderName,
          channelLabel,
          messagePreview: fullMessage,
          photoNote,
          messagesUrl,
          recipientName: recipient.name,
        },
      },
      email: {
        ...mail,
        attachmentFileIds,
      },
      meta: {
        notificationKind: 'chat_message_received',
        conversationId: opts.conversationId,
        messageId: opts.messageId,
      },
    })
    if (result.channel !== 'none') queued++
  }

  return { queued }
}
