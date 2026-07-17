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
  const recipients = await db.select({
    id: users.id,
    name: users.name,
    email: users.email,
  })
    .from(users)
    .where(and(
      inArray(users.id, recipientIds),
      eq(users.isActive, true),
      isNotNull(users.approvedAt),
      eq(users.messageEmailNotify, true),
    ))

  if (!recipients.length) return { queued: 0 as const }

  const brand = await resolveEmailBrand(db)
  const appUrl = brand.appUrl || getAppUrl()
  const base = appUrl.replace(/\/$/, '')
  const messagesUrl = `${base}/messages?conversation=${opts.conversationId}`
  const preview = messagePreview(opts.body)
  const channelLabel = opts.isTeamChat || conversation.type === 'team'
    ? (conversation.title ?? TEAM_CHAT_TITLE)
    : 'Direct message'

  let queued = 0
  for (const recipient of recipients) {
    const mail = buildChatMessageReceivedEmail({
      recipientName: recipient.name,
      senderName,
      channelLabel,
      messagePreview: preview,
      messagesUrl,
      appUrl,
      brand,
    })
    await enqueueHtmlMail(db, recipient.email, mail, {
      notificationKind: 'chat_message_received',
      conversationId: opts.conversationId,
      messageId: opts.messageId,
      recipientUserId: recipient.id,
    })
    queued++
  }

  return { queued }
}
