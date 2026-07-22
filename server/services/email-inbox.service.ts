import { createHash } from 'node:crypto'
import { and, asc, count, desc, eq, gt, isNull, sql } from 'drizzle-orm'
import type { Db } from '../db/client'
import { accountTypes, users } from '../db/schema/auth'
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
import { emailPreviewText, normalizeInboundEmailText, stripQuotedEmailHtml, stripQuotedPlainEmailText } from '../../shared/email-display'
import { normalizeOutgoingMessage } from '../../shared/format/outgoing-message'
import { normalizeContentId, rewriteEmailHtmlCidSources } from '../../shared/email-inline-images'
import {
  DOCUMENT_ATTACHMENT_MIMES,
  isInlineEmailPart,
  resolveEmailAttachmentMime,
  resolveInlineImageMime,
} from '../../shared/email-attachment-mime'
import { sendBrandedMail } from '../mail/branded-mail'
import { EMAIL_BRAND_NAME } from '../mail/email-layout'
import {
  buildOutboundEmailBodies,
  buildReplyThreadHeaders,
  extractEmailAddresses,
  generateInternetMessageId,
  normalizeEmailAddress,
} from '../mail/email-thread'
import { getImapFilters } from './imap-config.service'
import { getSmtpConfig } from './app-config.service'
import { notifyCustomerEmailReceived } from './staff-notifications.service'
import {
  sendCustomerAutoResponderIfEnabled,
  shouldAutoRespondToInbound,
  shouldSkipAutoResponder,
} from './email-auto-responder.service'
import {
  ALLOWED_UPLOAD_MIMES,
  FilesServiceError,
  listFilesByOwner,
  maxUploadBytes,
  sniffMime,
  uploadFile,
} from './files.service'
import { suppressesInboundEmail } from './email-ingest-suppression.service'

export type EmailInboxErrorCode
  = 'NOT_FOUND' | 'NOT_CONFIGURED' | 'INVALID_RECIPIENT' | 'SEND_FAILED'
    | 'INVALID_ATTACHMENT' | 'ATTACHMENT_TOO_LARGE' | 'NOT_ALLOWED'

export class EmailInboxError extends Error {
  constructor(public readonly code: EmailInboxErrorCode) {
    super(code)
  }
}

export interface OutboundAttachmentInput {
  filename: string
  mimeType: string
  data: Buffer
}

const HEIC_EQUIVALENTS = new Set(['image/heic', 'image/heif'])

/** Validate outbound attachments up-front so we never persist a half-sent message. */
function assertValidOutboundAttachments(attachments: OutboundAttachmentInput[]): void {
  const limit = maxUploadBytes()
  for (const att of attachments) {
    if (!att.data.length) throw new EmailInboxError('INVALID_ATTACHMENT')
    if (att.data.length > limit) throw new EmailInboxError('ATTACHMENT_TOO_LARGE')
    const mime = att.mimeType.toLowerCase()
    if (!ALLOWED_UPLOAD_MIMES.has(mime)) throw new EmailInboxError('INVALID_ATTACHMENT')
    const sniffed = sniffMime(att.data)
    const accepted = HEIC_EQUIVALENTS.has(mime) ? HEIC_EQUIVALENTS : new Set([mime])
    if (!sniffed || !accepted.has(sniffed)) throw new EmailInboxError('INVALID_ATTACHMENT')
  }
}

/** Persist validated outbound attachments against a message and return their metadata. */
async function persistOutboundAttachments(
  db: Db,
  messageId: string,
  actorUserId: string,
  attachments: OutboundAttachmentInput[],
): Promise<Array<{ id: string, filename: string, mimeType: string, fileSizeBytes: number }>> {
  const saved: Array<{ id: string, filename: string, mimeType: string, fileSizeBytes: number }> = []
  for (const att of attachments) {
    const file = await uploadFile(db, {
      ownerEntityType: 'message',
      ownerEntityId: messageId,
      fileKind: 'attachment',
      originalFilename: att.filename,
      mimeType: att.mimeType.toLowerCase(),
      data: att.data,
    }, actorUserId)
    saved.push({
      id: file.id,
      filename: file.originalFilename,
      mimeType: file.mimeType,
      fileSizeBytes: file.fileSizeBytes,
    })
  }
  return saved
}

function toMailAttachments(attachments: OutboundAttachmentInput[]) {
  return attachments.map(att => ({
    filename: att.filename,
    content: att.data,
    contentType: att.mimeType.toLowerCase(),
  }))
}

export interface InboundEmailAttachment {
  filename?: string | null
  contentType: string
  content: Buffer
  related?: boolean
  contentDisposition?: string | null
  cid?: string | null
  contentId?: string | null
}

function safeInboundAttachmentName(filename: string | null | undefined, index: number): string {
  const leaf = String(filename || `attachment-${index + 1}`)
    .split(/[\\/]/)
    .pop()!
    .replace(/[\u202a-\u202e\u2066-\u2069]/g, '_')
    .split('')
    .map(char => {
      const code = char.charCodeAt(0)
      return code < 32 || code === 127 ? '_' : char
    })
    .join('')
    .trim()
  return (leaf || `attachment-${index + 1}`).slice(0, 240)
}

function attachmentContentId(attachment: InboundEmailAttachment): string | null {
  const raw = attachment.cid ?? attachment.contentId
  if (!raw?.trim()) return null
  return normalizeContentId(raw)
}

async function persistInboundAttachments(
  db: Db,
  messageId: string,
  attachments: InboundEmailAttachment[],
  opts: { skipExisting?: boolean } = {},
): Promise<number> {
  const maxTotalBytes = maxUploadBytes() * 2
  let totalBytes = 0
  let persisted = 0

  let existingInlineCids = new Set<string>()
  let existingAttachmentHashes = new Set<string>()
  let existingInlineHashes = new Set<string>()
  if (opts.skipExisting) {
    const inlineFiles = await listFilesByOwner(db, {
      ownerEntityType: 'message',
      ownerEntityId: messageId,
      fileKind: 'inline',
    })
    existingInlineCids = new Set(
      inlineFiles.map(file => file.contentId).filter(Boolean).map(id => normalizeContentId(id!)),
    )
    const regularFiles = await listFilesByOwner(db, {
      ownerEntityType: 'message',
      ownerEntityId: messageId,
      fileKind: 'attachment',
    })
    const allFiles = [...inlineFiles, ...regularFiles]
    for (const file of allFiles) {
      if (file.fileKind === 'inline') existingInlineHashes.add(file.sha256Hash)
      if (file.fileKind === 'attachment') existingAttachmentHashes.add(file.sha256Hash)
    }
  }

  for (const [index, attachment] of attachments.slice(0, 20).entries()) {
    if (!attachment.content.length) continue

    if (isInlineEmailPart(attachment)) {
      const contentId = attachmentContentId(attachment)
      const sniffed = sniffMime(attachment.content)
      const mimeType = resolveInlineImageMime(attachment.contentType, sniffed, ALLOWED_UPLOAD_MIMES)
      if (!contentId || !mimeType) continue

      const sha256 = createHash('sha256').update(attachment.content).digest('hex')
      if (opts.skipExisting && (existingInlineCids.has(contentId) || existingInlineHashes.has(sha256))) continue

      totalBytes += attachment.content.length
      if (totalBytes > maxTotalBytes) {
        console.warn('[email-inbox] inline image total exceeded limit for message', messageId)
        break
      }

      try {
        await uploadFile(db, {
          ownerEntityType: 'message',
          ownerEntityId: messageId,
          fileKind: 'inline',
          originalFilename: safeInboundAttachmentName(attachment.filename, index),
          mimeType,
          data: attachment.content,
          contentId,
        }, null)
        persisted++
        existingInlineCids.add(contentId)
        existingInlineHashes.add(sha256)
      }
      catch (err) {
        if (err instanceof FilesServiceError) {
          console.warn('[email-inbox] skipped unsafe inline image', {
            messageId,
            contentId,
            reason: err.code,
          })
          continue
        }
        throw err
      }
      continue
    }

    const sniffed = sniffMime(attachment.content)
    const mimeType = resolveEmailAttachmentMime(
      attachment.contentType,
      attachment.filename,
      sniffed,
      ALLOWED_UPLOAD_MIMES,
    )
    if (!mimeType) {
      console.warn('[email-inbox] skipped unsafe attachment', {
        messageId,
        filename: attachment.filename,
        mimeType: attachment.contentType,
      })
      continue
    }

    const sha256 = createHash('sha256').update(attachment.content).digest('hex')
    if (opts.skipExisting && existingAttachmentHashes.has(sha256)) continue

    totalBytes += attachment.content.length
    if (totalBytes > maxTotalBytes) {
      console.warn('[email-inbox] attachment total exceeded limit for message', messageId)
      break
    }

    try {
      await uploadFile(db, {
        ownerEntityType: 'message',
        ownerEntityId: messageId,
        fileKind: 'attachment',
        originalFilename: safeInboundAttachmentName(attachment.filename, index),
        mimeType,
        data: attachment.content,
        // Document types (docx, xlsx, csv, zip…) can't be magic-byte sniffed;
        // they've already been validated against the document allowlist and are
        // served download-only, so bypass the image/PDF upload allowlist here.
        trusted: DOCUMENT_ATTACHMENT_MIMES.has(mimeType),
      }, null)
      persisted++
      existingAttachmentHashes.add(sha256)
    }
    catch (err) {
      if (err instanceof FilesServiceError) {
        console.warn('[email-inbox] skipped unsafe attachment', {
          messageId,
          filename: attachment.filename,
          reason: err.code,
        })
        continue
      }
      throw err
    }
  }

  return persisted
}

/** Backfill inline images and missing file attachments when re-syncing existing messages. */
export async function repairInboundEmailMedia(
  db: Db,
  messageId: string,
  input: { attachments?: InboundEmailAttachment[] },
): Promise<number> {
  if (!input.attachments?.length) return 0
  return persistInboundAttachments(db, messageId, input.attachments, { skipExisting: true })
}

export async function isEmailInboxReady(db: Db): Promise<boolean> {
  const result = await db.execute<{ inbox_reg: string | null, suppression_reg: string | null }>(
    sql`SELECT
      to_regclass('public.email_threads') AS inbox_reg,
      to_regclass('public.email_ingest_suppressions') AS suppression_reg`,
  )
  return Boolean(result.rows[0]?.inbox_reg && result.rows[0]?.suppression_reg)
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

/** Import company-sent replies that belong to an existing customer thread (auto-responder, sent copies). */
export function shouldIngestCompanyOutboundEmail(
  companyInboxes: Set<string>,
  from: string,
  to: string[],
): boolean {
  const fromAddr = normalizeEmailAddress(from)
  return !!fromAddr && companyInboxes.has(fromAddr) && to.length > 0
}

export async function resolveConversationIdFromThreadHeaders(
  db: Db,
  inReplyTo?: string | null,
  references?: string | null,
): Promise<string | null> {
  if (inReplyTo) {
    const [parent] = await db.select({ conversationId: messages.conversationId })
      .from(emailMessageMeta)
      .innerJoin(messages, eq(messages.id, emailMessageMeta.messageId))
      .where(eq(emailMessageMeta.internetMessageId, inReplyTo))
      .limit(1)
    if (parent) return parent.conversationId
  }

  if (references) {
    for (const ref of references.split(/\s+/).filter(Boolean)) {
      const [parent] = await db.select({ conversationId: messages.conversationId })
        .from(emailMessageMeta)
        .innerJoin(messages, eq(messages.id, emailMessageMeta.messageId))
        .where(eq(emailMessageMeta.internetMessageId, ref))
        .limit(1)
      if (parent) return parent.conversationId
    }
  }

  return null
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
    if (!shouldIncludeEmailThreadInDefaultScope(row.thread, customerEmails, filter.emailScope)) continue

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

  const items = await Promise.all(rows.map(async (r) => {
    let attachments: Awaited<ReturnType<typeof listFilesByOwner>> = []
    try {
      const [regular, inline] = await Promise.all([
        listFilesByOwner(db, {
          ownerEntityType: 'message',
          ownerEntityId: r.id,
          fileKind: 'attachment',
        }),
        listFilesByOwner(db, {
          ownerEntityType: 'message',
          ownerEntityId: r.id,
          fileKind: 'inline',
        }),
      ])
      // Always surface every stored file (inline + regular). Inline images also
      // render inside the HTML body, but listing them here as well guarantees
      // that photos remain visible even if the sandboxed HTML frame cannot load
      // them — matching Gmail, which always shows attachments/images.
      attachments = [...regular, ...inline]
    }
    catch (err) {
      console.warn('[email-inbox] attachment list failed for message', r.id, (err as Error).message)
    }

    return {
      id: r.id,
      conversationId: r.conversationId,
      body: stripQuotedPlainEmailText(r.body),
      senderUserId: r.senderUserId,
      senderName: r.senderName
        ?? (r.direction === 'inbound' ? r.fromAddress : EMAIL_BRAND_NAME),
      createdAt: r.createdAt.toISOString(),
      channel: 'email' as const,
      direction: (r.direction ?? 'outbound') as 'inbound' | 'outbound',
      hasHtmlBody: !!r.htmlBody?.trim(),
      fromAddress: r.fromAddress,
      entityRefs: [],
      attachments: attachments.map(file => ({
        id: file.id,
        filename: file.originalFilename,
        mimeType: file.mimeType,
        fileSizeBytes: file.fileSizeBytes,
        kind: file.fileKind === 'inline' ? 'inline' as const : 'attachment' as const,
      })),
    }
  }))

  return {
    items,
  }
}

export async function getEmailMessageHtml(db: Db, conversationId: string, messageId: string) {
  const thread = await getEmailThread(db, conversationId)
  const [row] = await db.select({
    body: messages.body,
    direction: emailMessageMeta.direction,
    htmlBody: emailMessageMeta.htmlBody,
    senderName: users.name,
    accountTypeKey: accountTypes.key,
  })
    .from(messages)
    .innerJoin(emailMessageMeta, eq(emailMessageMeta.messageId, messages.id))
    .leftJoin(users, eq(users.id, messages.senderUserId))
    .leftJoin(accountTypes, eq(accountTypes.id, users.accountTypeId))
    .where(and(
      eq(messages.id, messageId),
      eq(messages.conversationId, conversationId),
    ))
    .limit(1)
  if (!row) throw new EmailInboxError('NOT_FOUND')

  // Re-render our own outbound emails from the current template so historical
  // messages reflect the latest signature/branding, not the HTML stored at send time.
  let htmlBody: string | null
  const trimmedBody = stripQuotedPlainEmailText(row.body)
  if (row.direction === 'outbound' && row.senderName) {
    const { html } = await buildOutboundEmailBodies(db, {
      staffName: row.senderName,
      accountTypeKey: row.accountTypeKey,
      bodyText: trimmedBody,
      subject: thread.subject,
    })
    htmlBody = html
  }
  else {
    htmlBody = row.htmlBody ? stripQuotedEmailHtml(row.htmlBody) : row.htmlBody
  }

  if (htmlBody?.trim() && /\bcid:/i.test(htmlBody)) {
    const inlineFiles = await listFilesByOwner(db, {
      ownerEntityType: 'message',
      ownerEntityId: messageId,
      fileKind: 'inline',
    })
    if (inlineFiles.length) {
      const cidToUrl = new Map<string, string>()
      for (const file of inlineFiles) {
        if (!file.contentId) continue
        cidToUrl.set(
          normalizeContentId(file.contentId),
          `/api/conversations/${conversationId}/messages/${messageId}/attachments/${file.id}/preview`,
        )
      }
      htmlBody = rewriteEmailHtmlCidSources(htmlBody, cid => cidToUrl.get(cid) ?? null)
    }
  }

  return { htmlBody }
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

/** Default email inbox scope includes customer threads and staff-initiated non-customer mail. */
export function shouldIncludeEmailThreadInDefaultScope(
  thread: { customerId: string | null, staffInitiated: boolean, counterpartEmail: string },
  customerEmails: Set<string>,
  emailScope?: 'customers' | 'all',
): boolean {
  if (emailScope === 'all') return true
  const counterpart = thread.counterpartEmail.toLowerCase()
  const isCustomerThread = !!thread.customerId || customerEmails.has(counterpart)
  return isCustomerThread || thread.staffInitiated
}

export async function startEmailThread(
  db: Db,
  actorUserId: string,
  input: { customerId?: string, toEmail: string, subject: string, body: string },
  attachments: OutboundAttachmentInput[] = [],
) {
  if (!getSmtpConfig()) throw new EmailInboxError('NOT_CONFIGURED')

  assertValidOutboundAttachments(attachments)

  const toEmail = input.toEmail.trim().toLowerCase()
  const actor = await getActorForOutbound(db, actorUserId)

  let customerId: string | null = null
  let counterpartName: string

  if (input.customerId) {
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

    customerId = customer.id
    counterpartName = customer.displayName
  }
  else {
    await assertActorCanSendNonCustomerEmail(db, actorUserId)
    const customerEmails = await buildCustomerEmailAddresses(db)
    if (customerEmails.has(toEmail)) throw new EmailInboxError('INVALID_RECIPIENT')
    counterpartName = toEmail
  }

  const subject = input.subject.trim()
  const normalizedBody = normalizeOutgoingMessage(input.body.trim())
  const internetMessageId = generateInternetMessageId()
  const { text, html, brand } = await buildOutboundEmailBodies(db, {
    staffName: actor.name,
    accountTypeKey: actor.accountTypeKey,
    bodyText: normalizedBody,
    subject,
  })

  const [conversation] = await db.insert(conversations).values({ type: 'email' }).returning()
  await db.insert(emailThreads).values({
    conversationId: conversation!.id,
    customerId,
    counterpartEmail: toEmail,
    counterpartName,
    subject,
    rootMessageId: internetMessageId,
    staffInitiated: !input.customerId,
  })

  const [message] = await db.insert(messages).values({
    conversationId: conversation!.id,
    senderUserId: actorUserId,
    body: normalizedBody,
  }).returning()

  await persistOutboundAttachments(db, message!.id, actorUserId, attachments)

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
    subject,
    text,
    html,
    messageId: internetMessageId,
    attachments: toMailAttachments(attachments),
  }, brand)
  if (!delivered.delivered && process.env.NODE_ENV === 'production') {
    throw new EmailInboxError('SEND_FAILED')
  }

  await db.update(conversations).set({ updatedAt: new Date() }).where(eq(conversations.id, conversation!.id))
  await db.update(emailThreads).set({ updatedAt: new Date() }).where(eq(emailThreads.conversationId, conversation!.id))

  return { conversationId: conversation!.id, messageId: message!.id }
}

async function assertActorCanSendNonCustomerEmail(db: Db, actorUserId: string): Promise<void> {
  const [actor] = await db.select({
    approvedAt: users.approvedAt,
    isActive: users.isActive,
    nonCustomerEmailEnabled: users.nonCustomerEmailEnabled,
    accountTypeKey: accountTypes.key,
  })
    .from(users)
    .innerJoin(accountTypes, eq(accountTypes.id, users.accountTypeId))
    .where(eq(users.id, actorUserId))
    .limit(1)
  if (!actor) throw new EmailInboxError('NOT_FOUND')
  if (actor.accountTypeKey === 'customer') throw new EmailInboxError('NOT_ALLOWED')
  if (!actor.approvedAt || !actor.isActive || !actor.nonCustomerEmailEnabled) {
    throw new EmailInboxError('NOT_ALLOWED')
  }
}

/** Load the sending staff member with their account-type key for the signature. */
async function getActorForOutbound(db: Db, actorUserId: string) {
  const [actor] = await db.select({
    id: users.id,
    name: users.name,
    accountTypeKey: accountTypes.key,
  })
    .from(users)
    .innerJoin(accountTypes, eq(accountTypes.id, users.accountTypeId))
    .where(eq(users.id, actorUserId))
    .limit(1)
  if (!actor) throw new EmailInboxError('NOT_FOUND')
  return actor
}

export async function replyToEmailThread(
  db: Db,
  conversationId: string,
  actorUserId: string,
  body: string,
  attachments: OutboundAttachmentInput[] = [],
) {
  if (!getSmtpConfig()) throw new EmailInboxError('NOT_CONFIGURED')

  assertValidOutboundAttachments(attachments)

  const thread = await getEmailThread(db, conversationId)
  const actor = await getActorForOutbound(db, actorUserId)

  const parent = await getLatestThreadHeaders(db, conversationId)
  const internetMessageId = generateInternetMessageId()
  const { subject, inReplyTo, references } = buildReplyThreadHeaders({
    subject: thread.subject,
    parentMessageId: parent?.internetMessageId ?? thread.rootMessageId,
    existingReferences: parent?.emailReferences,
  })
  const normalizedBody = normalizeOutgoingMessage(body.trim())
  const { text, html, brand } = await buildOutboundEmailBodies(db, {
    staffName: actor.name,
    accountTypeKey: actor.accountTypeKey,
    bodyText: normalizedBody,
    subject,
  })

  const [message] = await db.insert(messages).values({
    conversationId,
    senderUserId: actorUserId,
    body: normalizedBody,
  }).returning()

  const savedAttachments = await persistOutboundAttachments(db, message!.id, actorUserId, attachments)

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
    attachments: toMailAttachments(attachments),
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
    attachments: savedAttachments,
  }
}

export async function getConversationType(db: Db, conversationId: string): Promise<'dm' | 'email' | 'team' | null> {
  const [row] = await db.select({ type: conversations.type })
    .from(conversations)
    .where(eq(conversations.id, conversationId))
    .limit(1)
  return (row?.type as 'dm' | 'email' | 'team' | undefined) ?? null
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
  attachments?: InboundEmailAttachment[]
}) {
  const normalizedId = input.internetMessageId.trim()
  if (!normalizedId) return { skipped: true as const, reason: 'missing_message_id' as const }

  if (await suppressesInboundEmail(db, {
    internetMessageId: normalizedId,
    inReplyTo: input.inReplyTo,
    references: input.references,
  })) {
    return { skipped: true as const, reason: 'suppressed' as const }
  }

  const [existing] = await db.select({ messageId: emailMessageMeta.messageId })
    .from(emailMessageMeta)
    .where(eq(emailMessageMeta.internetMessageId, normalizedId))
    .limit(1)
  if (existing) {
    const repaired = await repairInboundEmailMedia(db, existing.messageId, input)
    return { skipped: true as const, reason: 'duplicate' as const, repaired }
  }

  const from = normalizeEmailAddress(input.from)
  const companyInboxes = buildCompanyInboxAddresses()
  const customerEmails = await buildCustomerEmailAddresses(db)
  const ingestInbound = shouldIngestInboundEmail(companyInboxes, customerEmails, from, input.to, input.cc ?? [])

  let direction: 'inbound' | 'outbound' = 'inbound'
  let conversationId: string | null = null
  let isNewThread = false

  if (ingestInbound) {
    conversationId = await resolveConversationIdFromThreadHeaders(db, input.inReplyTo, input.references)
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

    const messageBody = stripQuotedPlainEmailText(normalizeInboundEmailText(input.text, input.html))
    const [message] = await db.insert(messages).values({
      conversationId,
      senderUserId: null,
      body: messageBody,
      createdAt: input.receivedAt ?? new Date(),
    }).returning()

    await persistInboundAttachments(db, message!.id, input.attachments ?? [])

    await db.insert(emailMessageMeta).values({
      messageId: message!.id,
      direction: 'inbound',
      internetMessageId: normalizedId,
      inReplyTo: input.inReplyTo ?? null,
      emailReferences: input.references ?? null,
      fromAddress: from,
      toAddresses: input.to,
      ccAddresses: input.cc ?? [],
      htmlBody: input.html ? stripQuotedEmailHtml(input.html) : null,
    })

    await db.update(conversations).set({ updatedAt: new Date() }).where(eq(conversations.id, conversationId))
    await db.update(emailThreads).set({ updatedAt: new Date() }).where(eq(emailThreads.conversationId, conversationId))

    void notifyCustomerEmailReceived(db, {
      conversationId,
      customerName: customer?.displayName ?? counterpartEmail,
      customerEmail: counterpartEmail,
      subject: input.subject.trim() || '(No subject)',
      messageBody: message!.body,
      htmlBody: input.html ? stripQuotedEmailHtml(input.html) : null,
    }).catch((err) => {
      console.warn('[email-inbox] customer email staff notify failed', err)
    })

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
          inboundReferences: input.references,
        })
      }
      catch (err) {
        console.warn('[email-inbox] auto-responder failed', err)
      }
    }

    return { skipped: false as const, conversationId, messageId: message!.id }
  }

  if (!shouldIngestCompanyOutboundEmail(companyInboxes, from, input.to)) {
    return { skipped: true as const, reason: 'filtered' as const }
  }

  conversationId = await resolveConversationIdFromThreadHeaders(db, input.inReplyTo, input.references)
  if (!conversationId) {
    return { skipped: true as const, reason: 'filtered' as const }
  }

  const thread = await getEmailThread(db, conversationId)
  const recipients = [...input.to, ...(input.cc ?? [])].map(addr => normalizeEmailAddress(addr))
  if (!recipients.includes(thread.counterpartEmail.toLowerCase())) {
    return { skipped: true as const, reason: 'filtered' as const }
  }

  direction = 'outbound'
  const messageBody = stripQuotedPlainEmailText(normalizeInboundEmailText(input.text, input.html))
  const [message] = await db.insert(messages).values({
    conversationId,
    senderUserId: null,
    body: messageBody,
    createdAt: input.receivedAt ?? new Date(),
  }).returning()

  await persistInboundAttachments(db, message!.id, input.attachments ?? [])

  await db.insert(emailMessageMeta).values({
    messageId: message!.id,
    direction,
    internetMessageId: normalizedId,
    inReplyTo: input.inReplyTo ?? null,
    emailReferences: input.references ?? null,
    fromAddress: from,
    toAddresses: input.to,
    ccAddresses: input.cc ?? [],
    htmlBody: input.html ? stripQuotedEmailHtml(input.html) : null,
    sentByUserId: null,
  })

  await db.update(conversations).set({ updatedAt: new Date() }).where(eq(conversations.id, conversationId))
  await db.update(emailThreads).set({ updatedAt: new Date() }).where(eq(emailThreads.conversationId, conversationId))

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
