import { and, asc, count, desc, eq, gt, isNull, sql } from 'drizzle-orm'
import type { Db } from '../db/client'
import { users } from '../db/schema/auth'
import { customerContacts, customers } from '../db/schema/customers'
import {
  conversations,
  messages,
} from '../db/schema/messages'
import {
  emailConversationReads,
  emailMessageMeta,
  emailThreads,
} from '../db/schema/email-inbox'
import { emailPreviewText, normalizeInboundEmailText } from '../../shared/email-display'
import { sendBrandedMail } from '../mail/branded-mail'
import {
  buildOutboundEmailBodies,
  buildReferences,
  extractEmailAddresses,
  generateInternetMessageId,
  normalizeEmailAddress,
  subjectWithRePrefix,
} from '../mail/email-thread'
import { getImapFilters } from './imap-config.service'
import { getSmtpConfig } from './app-config.service'
import { notifyCustomerEmailReceived } from './staff-notifications.service'
import {
  sendCustomerAutoResponderIfEnabled,
  shouldAutoRespondToInbound,
  shouldSkipAutoResponder,
} from './email-auto-responder.service'

export type EmailInboxErrorCode
  = 'NOT_FOUND' | 'NOT_CONFIGURED' | 'INVALID_RECIPIENT' | 'SEND_FAILED'

export class EmailInboxError extends Error {
  constructor(public readonly code: EmailInboxErrorCode) {
    super(code)
  }
}

export async function isEmailInboxReady(db: Db): Promise<boolean> {
  const result = await db.execute<{ reg: string | null }>(
    sql`SELECT to_regclass('public.email_threads') AS reg`,
  )
  return Boolean(result.rows[0]?.reg)
}

/** Apply migration 0047 on demand when email inbox tables are missing. */
export async function ensureEmailInboxReady(db: Db): Promise<void> {
  if (await isEmailInboxReady(db)) return
  const { ensureEmailInboxSchema } = await import('../lib/ensure-email-inbox-schema.mjs')
  const { usePool } = await import('../db/client')
  await ensureEmailInboxSchema(usePool())
  if (!(await isEmailInboxReady(db))) {
    throw new Error('Email inbox tables could not be created automatically')
  }
}

export async function buildCustomerEmailAddresses(db: Db): Promise<Set<string>> {
  const filters = getImapFilters()
  const emails = new Set<string>()
  if (!filters.includeCustomerEmails) return emails

  const customerRows = await db.select({ email: customers.email }).from(customers)
    .where(isNull(customers.archivedAt))
  for (const row of customerRows) {
    if (row.email) emails.add(row.email.toLowerCase())
  }

  const contactRows = await db.select({ email: customerContacts.email }).from(customerContacts)
    .where(isNull(customerContacts.archivedAt))
  for (const row of contactRows) {
    if (row.email) emails.add(row.email.toLowerCase())
  }

  return emails
}

export function buildCompanyInboxAddresses(): Set<string> {
  const filters = getImapFilters()
  const inboxes = new Set<string>()

  for (const addr of [filters.companyEmail, ...filters.additionalEmails]) {
    if (addr) inboxes.add(addr.toLowerCase())
  }

  const smtp = getSmtpConfig()
  if (smtp?.from) {
    for (const addr of extractEmailAddresses(smtp.from)) inboxes.add(addr)
  }
  if (smtp?.user) inboxes.add(smtp.user.toLowerCase())

  return inboxes
}

/** Mail delivered to a company inbox address (any sender except our own inboxes). */
export function messageMatchesCompanyInboxFilter(
  companyInboxes: Set<string>,
  from: string,
  to: string[],
  cc: string[] = [],
): boolean {
  if (!companyInboxes.size) return false

  const fromAddr = normalizeEmailAddress(from)
  if (!fromAddr || companyInboxes.has(fromAddr)) return false

  const recipients = [...to, ...cc].map(normalizeEmailAddress)
  return recipients.some(addr => companyInboxes.has(addr))
}

/** Import only customer → company inbox mail (blocks Google alerts, newsletters, etc.). */
export function messageMatchesCustomerInboxFilter(
  companyInboxes: Set<string>,
  customerEmails: Set<string>,
  from: string,
  to: string[],
  cc: string[] = [],
): boolean {
  if (!companyInboxes.size || !customerEmails.size) return false

  const fromAddr = normalizeEmailAddress(from)
  if (!customerEmails.has(fromAddr)) return false

  return messageMatchesCompanyInboxFilter(companyInboxes, from, to, cc)
}

/** Decide whether an inbound message should be imported into Messages. */
export function shouldIngestInboundEmail(
  companyInboxes: Set<string>,
  customerEmails: Set<string>,
  from: string,
  to: string[],
  cc: string[] = [],
): boolean {
  if (!messageMatchesCompanyInboxFilter(companyInboxes, from, to, cc)) return false
  if (messageMatchesCustomerInboxFilter(companyInboxes, customerEmails, from, to, cc)) return true

  const filters = getImapFilters()
  return filters.autoResponder.enabled && filters.autoResponder.scope === 'all'
}

export async function resolveCustomerByEmail(db: Db, email: string) {
  const normalized = email.toLowerCase()
  const [customer] = await db.select({ id: customers.id, displayName: customers.displayName, email: customers.email })
    .from(customers)
    .where(and(sql`lower(${customers.email}) = ${normalized}`, isNull(customers.archivedAt)))
    .limit(1)
  if (customer) return customer

  const [contact] = await db.select({
    customerId: customerContacts.customerId,
    displayName: customers.displayName,
    email: customerContacts.email,
  })
    .from(customerContacts)
    .innerJoin(customers, eq(customers.id, customerContacts.customerId))
    .where(and(sql`lower(${customerContacts.email}) = ${normalized}`, isNull(customerContacts.archivedAt)))
    .limit(1)

  if (contact) {
    return { id: contact.customerId, displayName: contact.displayName, email: contact.email }
  }
  return null
}

export interface EmailConversationSummary {
  id: string
  type: 'email'
  customer: { id: string | null, name: string, email: string } | null
  subject: string
  lastMessage: {
    id: string
    body: string
    senderUserId: string | null
    senderName: string | null
    direction: 'inbound' | 'outbound'
    createdAt: string
    preview: string
  } | null
  unreadCount: number
  updatedAt: string
}

function previewBody(body: string, html?: string | null): string {
  return emailPreviewText(body, html)
}

export async function listEmailConversations(db: Db, filter: {
  userId: string
  q?: string
  page: number
  pageSize: number
  emailScope?: 'customers' | 'all'
}) {
  const customerEmails = await buildCustomerEmailAddresses(db)
  const rows = await db.select({
    conversation: conversations,
    thread: emailThreads,
    customerName: customers.displayName,
  })
    .from(emailThreads)
    .innerJoin(conversations, eq(conversations.id, emailThreads.conversationId))
    .leftJoin(customers, eq(customers.id, emailThreads.customerId))
    .orderBy(desc(emailThreads.updatedAt))

  const filtered: typeof rows = []
  for (const row of rows) {
    const counterpart = row.thread.counterpartEmail.toLowerCase()
    const isCustomerThread = !!row.thread.customerId || customerEmails.has(counterpart)
    if (filter.emailScope !== 'all' && !isCustomerThread) continue

    const label = row.customerName || row.thread.counterpartName || row.thread.counterpartEmail
    if (filter.q) {
      const term = filter.q.toLowerCase()
      const hay = `${label} ${row.thread.subject} ${row.thread.counterpartEmail}`.toLowerCase()
      if (!hay.includes(term)) continue
    }
    filtered.push(row)
  }

  const total = filtered.length
  const offset = (filter.page - 1) * filter.pageSize
  const pageRows = filtered.slice(offset, offset + filter.pageSize)
  const convIds = pageRows.map(r => r.conversation.id)

  if (!convIds.length) {
    return { items: [], total, page: filter.page, pageSize: filter.pageSize }
  }

  const lastMessageResult = await db.execute<{
    conversation_id: string
    id: string
    body: string
    sender_user_id: string | null
    created_at: Date
    direction: string | null
    sender_name: string | null
    html_snippet: string | null
  }>(sql`
    SELECT DISTINCT ON (m.conversation_id)
      m.conversation_id,
      m.id,
      m.body,
      m.sender_user_id,
      m.created_at,
      em.direction,
      u.name AS sender_name,
      LEFT(COALESCE(em.html_body, ''), 2048) AS html_snippet
    FROM ${messages} m
    LEFT JOIN ${emailMessageMeta} em ON em.message_id = m.id
    LEFT JOIN ${users} u ON u.id = m.sender_user_id
    WHERE m.conversation_id IN (${sql.join(convIds.map(id => sql`${id}`), sql`, `)})
    ORDER BY m.conversation_id, m.created_at DESC
  `)

  const lastByConv = new Map(
    lastMessageResult.rows.map(row => [row.conversation_id, row]),
  )

  const unreadResult = await db.execute<{ conversation_id: string, unread_count: string }>(sql`
    SELECT m.conversation_id, COUNT(*)::text AS unread_count
    FROM ${messages} m
    LEFT JOIN ${emailConversationReads} r
      ON r.conversation_id = m.conversation_id AND r.user_id = ${filter.userId}
    WHERE m.conversation_id IN (${sql.join(convIds.map(id => sql`${id}`), sql`, `)})
      AND (r.last_read_at IS NULL OR m.created_at > r.last_read_at)
    GROUP BY m.conversation_id
  `)
  const unreadByConv = new Map(
    unreadResult.rows.map(row => [row.conversation_id, Number(row.unread_count)]),
  )

  const items: EmailConversationSummary[] = pageRows.map((row) => {
    const lastMessage = lastByConv.get(row.conversation.id)
    const label = row.customerName || row.thread.counterpartName || row.thread.counterpartEmail
    return {
      id: row.conversation.id,
      type: 'email',
      customer: row.thread.customerId
        ? { id: row.thread.customerId, name: label, email: row.thread.counterpartEmail }
        : { id: null, name: label, email: row.thread.counterpartEmail },
      subject: row.thread.subject,
      lastMessage: lastMessage
        ? {
            id: lastMessage.id,
            body: lastMessage.body,
            senderUserId: lastMessage.sender_user_id,
            senderName: lastMessage.sender_name,
            direction: (lastMessage.direction ?? 'outbound') as 'inbound' | 'outbound',
            createdAt: new Date(lastMessage.created_at).toISOString(),
            preview: previewBody(lastMessage.body, lastMessage.html_snippet),
          }
        : null,
      unreadCount: unreadByConv.get(row.conversation.id) ?? 0,
      updatedAt: row.thread.updatedAt.toISOString(),
    }
  })

  return { items, total, page: filter.page, pageSize: filter.pageSize }
}

export async function getEmailThread(db: Db, conversationId: string) {
  const [row] = await db.select().from(emailThreads)
    .where(eq(emailThreads.conversationId, conversationId))
    .limit(1)
  if (!row) throw new EmailInboxError('NOT_FOUND')
  return row
}

export async function listEmailMessages(db: Db, conversationId: string, filter: {
  page: number
  pageSize: number
  afterId?: string
}) {
  await getEmailThread(db, conversationId)

  const conditions = [eq(messages.conversationId, conversationId)]
  if (filter.afterId) {
    const [anchor] = await db.select({ createdAt: messages.createdAt })
      .from(messages).where(eq(messages.id, filter.afterId)).limit(1)
    if (anchor) conditions.push(gt(messages.createdAt, anchor.createdAt))
  }

  const rows = await db.select({
    id: messages.id,
    conversationId: messages.conversationId,
    body: messages.body,
    senderUserId: messages.senderUserId,
    senderName: users.name,
    createdAt: messages.createdAt,
    direction: emailMessageMeta.direction,
    fromAddress: emailMessageMeta.fromAddress,
    htmlBody: emailMessageMeta.htmlBody,
  })
    .from(messages)
    .leftJoin(emailMessageMeta, eq(emailMessageMeta.messageId, messages.id))
    .leftJoin(users, eq(users.id, messages.senderUserId))
    .where(and(...conditions))
    .orderBy(asc(messages.createdAt))
    .limit(filter.pageSize)
    .offset((filter.page - 1) * filter.pageSize)

  return {
    items: rows.map((r) => {
      const hasHtmlBody = !!r.htmlBody?.trim()
      return {
        id: r.id,
        conversationId: r.conversationId,
        body: r.body,
        senderUserId: r.senderUserId,
        senderName: r.senderName ?? (r.direction === 'inbound' ? r.fromAddress : null),
        createdAt: r.createdAt.toISOString(),
        channel: 'email' as const,
        direction: (r.direction ?? 'outbound') as 'inbound' | 'outbound',
        hasHtmlBody,
        fromAddress: r.fromAddress,
        entityRefs: [],
      }
    }),
  }
}

export async function getEmailMessageHtml(db: Db, conversationId: string, messageId: string) {
  await getEmailThread(db, conversationId)
  const [row] = await db.select({ htmlBody: emailMessageMeta.htmlBody })
    .from(messages)
    .innerJoin(emailMessageMeta, eq(emailMessageMeta.messageId, messages.id))
    .where(and(
      eq(messages.id, messageId),
      eq(messages.conversationId, conversationId),
    ))
    .limit(1)
  if (!row) throw new EmailInboxError('NOT_FOUND')
  return { htmlBody: row.htmlBody }
}

export async function markEmailConversationRead(db: Db, conversationId: string, userId: string) {
  await getEmailThread(db, conversationId)
  const now = new Date()
  const [existing] = await db.select().from(emailConversationReads)
    .where(and(
      eq(emailConversationReads.conversationId, conversationId),
      eq(emailConversationReads.userId, userId),
    ))
    .limit(1)

  if (existing) {
    await db.update(emailConversationReads).set({ lastReadAt: now })
      .where(and(
        eq(emailConversationReads.conversationId, conversationId),
        eq(emailConversationReads.userId, userId),
      ))
  }
  else {
    await db.insert(emailConversationReads).values({
      conversationId,
      userId,
      lastReadAt: now,
    })
  }
}

async function getLatestThreadHeaders(db: Db, conversationId: string) {
  const [row] = await db.select({
    internetMessageId: emailMessageMeta.internetMessageId,
    emailReferences: emailMessageMeta.emailReferences,
  })
    .from(messages)
    .innerJoin(emailMessageMeta, eq(emailMessageMeta.messageId, messages.id))
    .where(eq(messages.conversationId, conversationId))
    .orderBy(desc(messages.createdAt))
    .limit(1)
  return row ?? null
}

export async function startEmailThread(
  db: Db,
  actorUserId: string,
  input: { customerId: string, toEmail: string, subject: string, body: string },
) {
  if (!getSmtpConfig()) throw new EmailInboxError('NOT_CONFIGURED')

  const toEmail = input.toEmail.trim().toLowerCase()
  const [customer] = await db.select({
    id: customers.id,
    displayName: customers.displayName,
    email: customers.email,
  })
    .from(customers)
    .where(and(eq(customers.id, input.customerId), isNull(customers.archivedAt)))
    .limit(1)
  if (!customer) throw new EmailInboxError('INVALID_RECIPIENT')

  const allowedEmails = new Set<string>()
  if (customer.email) allowedEmails.add(customer.email.toLowerCase())
  const contactRows = await db.select({ email: customerContacts.email })
    .from(customerContacts)
    .where(and(eq(customerContacts.customerId, customer.id), isNull(customerContacts.archivedAt)))
  for (const row of contactRows) {
    if (row.email) allowedEmails.add(row.email.toLowerCase())
  }
  if (!allowedEmails.has(toEmail)) throw new EmailInboxError('INVALID_RECIPIENT')

  const [actor] = await db.select({ id: users.id, name: users.name }).from(users)
    .where(eq(users.id, actorUserId)).limit(1)
  if (!actor) throw new EmailInboxError('NOT_FOUND')

  const internetMessageId = generateInternetMessageId()
  const { text, html, brand } = await buildOutboundEmailBodies(db, actor.name, input.body)

  const [conversation] = await db.insert(conversations).values({ type: 'email' }).returning()
  await db.insert(emailThreads).values({
    conversationId: conversation!.id,
    customerId: customer.id,
    counterpartEmail: toEmail,
    counterpartName: customer.displayName,
    subject: input.subject.trim(),
    rootMessageId: internetMessageId,
  })

  const [message] = await db.insert(messages).values({
    conversationId: conversation!.id,
    senderUserId: actorUserId,
    body: input.body.trim(),
  }).returning()

  await db.insert(emailMessageMeta).values({
    messageId: message!.id,
    direction: 'outbound',
    internetMessageId,
    fromAddress: normalizeEmailAddress(getSmtpConfig()!.from),
    toAddresses: [toEmail],
    ccAddresses: [],
    htmlBody: html,
    sentByUserId: actorUserId,
  })

  const delivered = await sendBrandedMail(db, {
    to: toEmail,
    subject: input.subject.trim(),
    text,
    html,
    messageId: internetMessageId,
  }, brand)
  if (!delivered.delivered && process.env.NODE_ENV === 'production') {
    throw new EmailInboxError('SEND_FAILED')
  }

  await db.update(conversations).set({ updatedAt: new Date() }).where(eq(conversations.id, conversation!.id))
  await db.update(emailThreads).set({ updatedAt: new Date() }).where(eq(emailThreads.conversationId, conversation!.id))

  return { conversationId: conversation!.id, messageId: message!.id }
}

export async function replyToEmailThread(
  db: Db,
  conversationId: string,
  actorUserId: string,
  body: string,
) {
  if (!getSmtpConfig()) throw new EmailInboxError('NOT_CONFIGURED')

  const thread = await getEmailThread(db, conversationId)
  const [actor] = await db.select({ id: users.id, name: users.name }).from(users)
    .where(eq(users.id, actorUserId)).limit(1)
  if (!actor) throw new EmailInboxError('NOT_FOUND')

  const parent = await getLatestThreadHeaders(db, conversationId)
  const internetMessageId = generateInternetMessageId()
  const inReplyTo = parent?.internetMessageId ?? thread.rootMessageId
  const references = buildReferences(parent?.emailReferences, inReplyTo)
  const subject = subjectWithRePrefix(thread.subject)
  const { text, html, brand } = await buildOutboundEmailBodies(db, actor.name, body)

  const [message] = await db.insert(messages).values({
    conversationId,
    senderUserId: actorUserId,
    body: body.trim(),
  }).returning()

  await db.insert(emailMessageMeta).values({
    messageId: message!.id,
    direction: 'outbound',
    internetMessageId,
    inReplyTo: inReplyTo ?? null,
    emailReferences: references,
    fromAddress: normalizeEmailAddress(getSmtpConfig()!.from),
    toAddresses: [thread.counterpartEmail],
    ccAddresses: [],
    htmlBody: html,
    sentByUserId: actorUserId,
  })

  const delivered = await sendBrandedMail(db, {
    to: thread.counterpartEmail,
    subject,
    text,
    html,
    messageId: internetMessageId,
    inReplyTo: inReplyTo ?? undefined,
    references: references ?? undefined,
  }, brand)
  if (!delivered.delivered && process.env.NODE_ENV === 'production') {
    throw new EmailInboxError('SEND_FAILED')
  }

  await db.update(conversations).set({ updatedAt: new Date() }).where(eq(conversations.id, conversationId))
  await db.update(emailThreads).set({ updatedAt: new Date() }).where(eq(emailThreads.conversationId, conversationId))

  return {
    id: message!.id,
    conversationId: message!.conversationId,
    body: message!.body,
    senderUserId: message!.senderUserId,
    senderName: actor.name,
    createdAt: message!.createdAt.toISOString(),
    channel: 'email' as const,
    direction: 'outbound' as const,
    htmlBody: html,
    fromAddress: normalizeEmailAddress(getSmtpConfig()!.from),
    entityRefs: [],
  }
}

export async function getConversationType(db: Db, conversationId: string): Promise<'dm' | 'email' | null> {
  const [row] = await db.select({ type: conversations.type })
    .from(conversations)
    .where(eq(conversations.id, conversationId))
    .limit(1)
  return (row?.type as 'dm' | 'email' | undefined) ?? null
}

export async function ingestInboundEmail(db: Db, input: {
  from: string
  to: string[]
  cc?: string[]
  subject: string
  text: string
  html?: string | null
  internetMessageId: string
  inReplyTo?: string | null
  references?: string | null
  receivedAt?: Date
  autoSubmitted?: string | null
  precedence?: string | null
}) {
  const normalizedId = input.internetMessageId.trim()
  if (!normalizedId) return { skipped: true as const, reason: 'missing_message_id' as const }

  const [existing] = await db.select({ messageId: emailMessageMeta.messageId })
    .from(emailMessageMeta)
    .where(eq(emailMessageMeta.internetMessageId, normalizedId))
    .limit(1)
  if (existing) return { skipped: true as const, reason: 'duplicate' as const }

  const from = normalizeEmailAddress(input.from)
  const companyInboxes = buildCompanyInboxAddresses()
  const customerEmails = await buildCustomerEmailAddresses(db)
  if (!shouldIngestInboundEmail(companyInboxes, customerEmails, from, input.to, input.cc ?? [])) {
    return { skipped: true as const, reason: 'filtered' as const }
  }

  let conversationId: string | null = null
  let isNewThread = false
  if (input.inReplyTo) {
    const [parent] = await db.select({ conversationId: messages.conversationId })
      .from(emailMessageMeta)
      .innerJoin(messages, eq(messages.id, emailMessageMeta.messageId))
      .where(eq(emailMessageMeta.internetMessageId, input.inReplyTo))
      .limit(1)
    conversationId = parent?.conversationId ?? null
  }

  if (!conversationId && input.references) {
    for (const ref of input.references.split(/\s+/).filter(Boolean)) {
      const [parent] = await db.select({ conversationId: messages.conversationId })
        .from(emailMessageMeta)
        .innerJoin(messages, eq(messages.id, emailMessageMeta.messageId))
        .where(eq(emailMessageMeta.internetMessageId, ref))
        .limit(1)
      if (parent) {
        conversationId = parent.conversationId
        break
      }
    }
  }

  const customer = await resolveCustomerByEmail(db, from)
  const counterpartEmail = from

  if (!conversationId) {
    isNewThread = true
    const [conversation] = await db.insert(conversations).values({ type: 'email' }).returning()
    conversationId = conversation!.id
    await db.insert(emailThreads).values({
      conversationId,
      customerId: customer?.id ?? null,
      counterpartEmail,
      counterpartName: customer?.displayName ?? null,
      subject: input.subject.trim() || '(No subject)',
      rootMessageId: normalizedId,
    })
  }

  const [message] = await db.insert(messages).values({
    conversationId,
    senderUserId: null,
    body: normalizeInboundEmailText(input.text, input.html),
    createdAt: input.receivedAt ?? new Date(),
  }).returning()

  await db.insert(emailMessageMeta).values({
    messageId: message!.id,
    direction: 'inbound',
    internetMessageId: normalizedId,
    inReplyTo: input.inReplyTo ?? null,
    emailReferences: input.references ?? null,
    fromAddress: from,
    toAddresses: input.to,
    ccAddresses: input.cc ?? [],
    htmlBody: input.html ?? null,
  })

  await db.update(conversations).set({ updatedAt: new Date() }).where(eq(conversations.id, conversationId))
  await db.update(emailThreads).set({ updatedAt: new Date() }).where(eq(emailThreads.conversationId, conversationId))

  void notifyCustomerEmailReceived(db, {
    conversationId,
    customerName: customer?.displayName ?? counterpartEmail,
    customerEmail: counterpartEmail,
    subject: input.subject.trim() || '(No subject)',
    messageBody: message!.body,
    htmlBody: input.html ?? null,
  }).catch(() => {})

  if (
    isNewThread
    && shouldAutoRespondToInbound(customer)
    && !shouldSkipAutoResponder({
      subject: input.subject,
      autoSubmitted: input.autoSubmitted,
      precedence: input.precedence,
    })
  ) {
    try {
      await sendCustomerAutoResponderIfEnabled(db, {
        conversationId: conversationId!,
        toEmail: from,
        recipientName: customer?.displayName ?? null,
        inboundSubject: input.subject,
        inboundMessageId: normalizedId,
      })
    }
    catch (err) {
      console.warn('[email-inbox] auto-responder failed', err)
    }
  }

  return { skipped: false as const, conversationId, messageId: message!.id }
}

export async function listCustomerEmailRecipients(db: Db, q?: string) {
  const term = q?.trim().toLowerCase()
  const rows = await db.select({
    id: customers.id,
    displayName: customers.displayName,
    email: customers.email,
  })
    .from(customers)
    .where(and(isNull(customers.archivedAt), sql`${customers.email} is not null`))
    .orderBy(asc(customers.displayName))

  const contacts = await db.select({
    customerId: customerContacts.customerId,
    displayName: customers.displayName,
    email: customerContacts.email,
    contactName: customerContacts.name,
  })
    .from(customerContacts)
    .innerJoin(customers, eq(customers.id, customerContacts.customerId))
    .where(and(isNull(customerContacts.archivedAt), sql`${customerContacts.email} is not null`))

  const items: Array<{ customerId: string, label: string, email: string }> = []
  const seen = new Set<string>()

  for (const row of rows) {
    if (!row.email) continue
    const key = row.email.toLowerCase()
    if (seen.has(key)) continue
    const label = `${row.displayName} · ${row.email}`
    if (term && !label.toLowerCase().includes(term)) continue
    seen.add(key)
    items.push({ customerId: row.id, label: row.displayName, email: row.email })
  }

  for (const row of contacts) {
    if (!row.email) continue
    const key = row.email.toLowerCase()
    if (seen.has(key)) continue
    const label = `${row.displayName}${row.contactName ? ` (${row.contactName})` : ''} · ${row.email}`
    if (term && !label.toLowerCase().includes(term)) continue
    seen.add(key)
    items.push({ customerId: row.customerId, label, email: row.email })
  }

  return items
}

export async function countEmailUnread(db: Db, userId: string): Promise<number> {
  if (!(await isEmailInboxReady(db))) return 0

  const threads = await db.select({ conversationId: emailThreads.conversationId }).from(emailThreads)
  let total = 0
  for (const thread of threads) {
    const [readRow] = await db.select({ lastReadAt: emailConversationReads.lastReadAt })
      .from(emailConversationReads)
      .where(and(
        eq(emailConversationReads.conversationId, thread.conversationId),
        eq(emailConversationReads.userId, userId),
      ))
      .limit(1)
    const [{ value }] = await db.select({ value: count() })
      .from(messages)
      .where(and(
        eq(messages.conversationId, thread.conversationId),
        readRow?.lastReadAt ? gt(messages.createdAt, readRow.lastReadAt) : sql`true`,
      ))
    total += Number(value)
  }
  return total
}
