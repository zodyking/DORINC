import type { Db } from '../db/client'
import { messages } from '../db/schema/messages'
import { emailMessageMeta } from '../db/schema/email-inbox'
import { buildCustomerAutoResponderEmail } from '../mail/templates/system'
import { sendBrandedMail } from '../mail/branded-mail'
import {
  buildReferences,
  generateInternetMessageId,
  normalizeEmailAddress,
  subjectWithRePrefix,
} from '../mail/email-thread'
import { getImapFilters, type ImapAutoResponderScope } from './imap-config.service'
import { getSmtpConfig } from './app-config.service'
import { resolveEmailBrand } from './email-branding.service'

export function shouldAutoRespondToInbound(
  customer: { id: string, displayName: string, email: string | null } | null,
): boolean {
  const auto = getImapFilters().autoResponder
  if (!auto.enabled) return false
  if (auto.scope === 'all') return true
  return !!customer
}

export function autoResponderMatchesScope(
  scope: ImapAutoResponderScope,
  isCustomer: boolean,
): boolean {
  return scope === 'all' || isCustomer
}

export async function sendCustomerAutoResponderIfEnabled(
  db: Db,
  input: {
    conversationId: string
    toEmail: string
    recipientName: string | null
    inboundSubject: string
    inboundMessageId: string
  },
): Promise<{ sent: boolean }> {
  const filters = getImapFilters()
  const auto = filters.autoResponder
  if (!auto.enabled || !auto.message.trim()) return { sent: false }
  if (!getSmtpConfig()) return { sent: false }

  const to = normalizeEmailAddress(input.toEmail)
  if (!to) return { sent: false }

  const brand = await resolveEmailBrand(db)
  const autoSubject = auto.subject.trim() || 'We received your message'
  const replySubject = subjectWithRePrefix(autoSubject)

  const mail = buildCustomerAutoResponderEmail({
    recipientName: input.recipientName,
    subject: replySubject,
    message: auto.message.trim(),
    appUrl: brand.appUrl,
    brand,
  })

  const internetMessageId = generateInternetMessageId()
  const references = buildReferences(null, input.inboundMessageId)

  const delivered = await sendBrandedMail(db, {
    to,
    subject: mail.subject,
    text: mail.text,
    html: mail.html,
    messageId: internetMessageId,
    inReplyTo: input.inboundMessageId,
    references: references ?? undefined,
  }, brand)

  if (!delivered.delivered && process.env.NODE_ENV === 'production') {
    console.warn('[email-auto-responder] SMTP delivery failed for', to)
    return { sent: false }
  }

  console.info('[email-auto-responder] sent confirmation to', to)

  const [message] = await db.insert(messages).values({
    conversationId: input.conversationId,
    senderUserId: null,
    body: mail.text,
  }).returning()

  const smtp = getSmtpConfig()!
  await db.insert(emailMessageMeta).values({
    messageId: message!.id,
    direction: 'outbound',
    internetMessageId,
    inReplyTo: input.inboundMessageId,
    emailReferences: references,
    fromAddress: normalizeEmailAddress(smtp.from),
    toAddresses: [to],
    ccAddresses: [],
    htmlBody: mail.html,
    sentByUserId: null,
  })

  return { sent: true }
}

/** Skip auto-replies when the inbound message is itself automated. */
export function shouldSkipAutoResponder(input: {
  subject?: string
  autoSubmitted?: string | null
  precedence?: string | null
}): boolean {
  if (input.autoSubmitted && !/^no$/i.test(input.autoSubmitted.trim())) return true
  if (input.precedence && /bulk|junk|list/i.test(input.precedence)) return true
  const subject = input.subject?.toLowerCase() ?? ''
  if (subject.includes('automatic reply') || subject.includes('auto-reply') || subject.includes('out of office')) {
    return true
  }
  return false
}
