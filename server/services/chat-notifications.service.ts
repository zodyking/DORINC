import { and, eq, inArray, isNotNull, ne } from 'drizzle-orm'
import type { Db } from '../db/client'
import { users } from '../db/schema/auth'
import { conversationParticipants, conversations } from '../db/schema/messages'
import { buildChatMessageReceivedEmail } from '../mail/templates/system.mjs'
import { getAppUrl } from './app-config.service'
import { enqueueJob } from './jobs.service'
import { messagePreview } from './messages.service'
import { resolveEmailBrand } from './email-branding.service'
import { TEAM_CHAT_TITLE } from './team-chat.service'
import { isQuoEnabled } from './quo.service'
import { resolveUserNotifyDelivery } from './user-notify-channel.service'
import { enqueueTemplatedSms } from './sms-notifications.service'

async function enqueueHtmlMail(
  db: Db,
  to: string,
  mail: { subject: string, text: string, html: string },
  meta: Record<string, unknown> = {},
) {
  return enqueueJob(db, 'email_send', {
    to,
    subject: mail.subject,
    text: mail.text,
    html: mail.html,
    ...meta,
  })
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
  const preview = messagePreview(opts.body)
  const channelLabel = opts.isTeamChat || conversation.type === 'team'
    ? (conversation.title ?? TEAM_CHAT_TITLE)
    : 'Direct message'

  let queued = 0
  for (const recipient of recipients) {
    const delivery = await resolveUserNotifyDelivery(db, recipient, {
      requireChatOptIn: !quoOn,
    })
    if (!delivery) continue

    if (delivery.channel === 'sms') {
      const result = await enqueueTemplatedSms(db, {
        to: delivery.phone,
        typeKey: 'chat_message_received',
        vars: {
          senderName,
          channelLabel,
          messagePreview: preview,
          messagesUrl,
          recipientName: recipient.name,
        },
        meta: {
          conversationId: opts.conversationId,
          messageId: opts.messageId,
          recipientUserId: recipient.id,
        },
      })
      if (result.queued) queued++
      continue
    }

    const mail = buildChatMessageReceivedEmail({
      recipientName: recipient.name,
      senderName,
      channelLabel,
      messagePreview: preview,
      messagesUrl,
      appUrl,
      brand,
      isTeamChat: opts.isTeamChat || conversation.type === 'team',
      templateOverride,
    })
    await enqueueHtmlMail(db, delivery.email, mail, {
      notificationKind: 'chat_message_received',
      conversationId: opts.conversationId,
      messageId: opts.messageId,
      recipientUserId: recipient.id,
    })
    queued++
  }

  return { queued }
}
