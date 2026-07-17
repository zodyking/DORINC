import { and, asc, count, desc, eq, gt, ilike, inArray, isNotNull, isNull, ne, or, sql } from 'drizzle-orm'
import type { Db } from '../db/client'
import { accountTypes, users } from '../db/schema/auth'
import { customers } from '../db/schema/customers'
import { emailThreads } from '../db/schema/email-inbox'
import { formatInvoiceNumber, invoices } from '../db/schema/invoices'
import {
  conversationParticipants,
  conversations,
  messageEntityRefs,
  messages,
  type MessageEntityType,
} from '../db/schema/messages'
import { serviceLogs } from '../db/schema/service-logs'
import { vehicles } from '../db/schema/vehicles'
import type { MessageEntityRefInput } from '../../shared/validators/messages'
import { normalizeOutgoingMessage } from '../../shared/format/outgoing-message'
import { getTeamConversationSummary, syncTeamChatParticipants } from './team-chat.service'

export type MessagesServiceErrorCode
  = | 'NOT_FOUND'
    | 'FORBIDDEN'
    | 'INVALID_PARTICIPANT'
    | 'SELF_DM'
    | 'ENTITY_NOT_FOUND'
    | 'ENTITY_FORBIDDEN'

export class MessagesServiceError extends Error {
  constructor(public readonly code: MessagesServiceErrorCode) {
    super(code)
  }
}

const ENTITY_REF_TOKEN_RE = /\[\[ref:([a-z_]+):([0-9a-f-]{36}):([^\]]+)\]\]/gi

export function entityRefToken(entityType: MessageEntityType, entityId: string, entityLabel: string): string {
  return `[[ref:${entityType}:${entityId}:${entityLabel}]]`
}

export function parseEntityRefsFromBody(body: string): MessageEntityRefInput[] {
  const refs: MessageEntityRefInput[] = []
  const seen = new Set<string>()
  let match: RegExpExecArray | null
  const re = new RegExp(ENTITY_REF_TOKEN_RE.source, 'gi')
  while ((match = re.exec(body)) !== null) {
    const entityType = match[1] as MessageEntityType
    const entityId = match[2]!
    const entityLabel = match[3]!.trim()
    const key = `${entityType}:${entityId}`
    if (!seen.has(key) && entityLabel) {
      seen.add(key)
      refs.push({ entityType, entityId, entityLabel })
    }
  }
  return refs
}

async function assertParticipant(db: Db, conversationId: string, userId: string) {
  const [row] = await db.select({ id: conversationParticipants.id })
    .from(conversationParticipants)
    .where(and(
      eq(conversationParticipants.conversationId, conversationId),
      eq(conversationParticipants.userId, userId),
    ))
  if (!row) throw new MessagesServiceError('FORBIDDEN')
}

async function getConversationRow(db: Db, conversationId: string) {
  const [row] = await db.select().from(conversations).where(eq(conversations.id, conversationId))
  return row ?? null
}

async function getOtherParticipant(db: Db, conversationId: string, userId: string) {
  const [row] = await db.select({
    userId: conversationParticipants.userId,
    name: users.name,
    email: users.email,
  })
    .from(conversationParticipants)
    .innerJoin(users, eq(conversationParticipants.userId, users.id))
    .where(and(
      eq(conversationParticipants.conversationId, conversationId),
      ne(conversationParticipants.userId, userId),
    ))
    .limit(1)
  return row ?? null
}

async function assertStaffUser(db: Db, userId: string) {
  const [row] = await db.select({
    id: users.id,
    isActive: users.isActive,
    approvedAt: users.approvedAt,
    accountTypeKey: accountTypes.key,
  })
    .from(users)
    .innerJoin(accountTypes, eq(users.accountTypeId, accountTypes.id))
    .where(eq(users.id, userId))

  if (!row || !row.isActive || !row.approvedAt || row.accountTypeKey === 'customer') {
    throw new MessagesServiceError('INVALID_PARTICIPANT')
  }
  return row
}

async function findExistingDm(db: Db, userA: string, userB: string) {
  const mine = await db.select({ conversationId: conversationParticipants.conversationId })
    .from(conversationParticipants)
    .where(eq(conversationParticipants.userId, userA))

  for (const row of mine) {
    const [match] = await db.select({ conversationId: conversationParticipants.conversationId })
      .from(conversationParticipants)
      .innerJoin(conversations, eq(conversations.id, conversationParticipants.conversationId))
      .where(and(
        eq(conversationParticipants.conversationId, row.conversationId),
        eq(conversationParticipants.userId, userB),
        eq(conversations.type, 'dm'),
      ))
      .limit(1)
    if (match) return match.conversationId
  }
  return null
}

export async function createOrGetDmConversation(db: Db, currentUserId: string, participantUserId: string) {
  if (currentUserId === participantUserId) throw new MessagesServiceError('SELF_DM')
  await assertStaffUser(db, participantUserId)

  const existing = await findExistingDm(db, currentUserId, participantUserId)
  if (existing) return getConversationDetail(db, existing, currentUserId)

  const [conversation] = await db.insert(conversations).values({ type: 'dm' }).returning()
  await db.insert(conversationParticipants).values([
    { conversationId: conversation!.id, userId: currentUserId },
    { conversationId: conversation!.id, userId: participantUserId },
  ])

  return getConversationDetail(db, conversation!.id, currentUserId)
}

export interface ListConversationsFilter {
  userId: string
  q?: string
  page: number
  pageSize: number
}

export async function listConversations(db: Db, filter: ListConversationsFilter) {
  await syncTeamChatParticipants(db)
  const teamSummary = await getTeamConversationSummary(db, filter.userId)

  const participantRows = await db.select({
    conversationId: conversationParticipants.conversationId,
    lastReadAt: conversationParticipants.lastReadAt,
  })
    .from(conversationParticipants)
    .innerJoin(conversations, eq(conversations.id, conversationParticipants.conversationId))
    .where(and(
      eq(conversationParticipants.userId, filter.userId),
      eq(conversations.type, 'dm'),
    ))

  const dmItems: Array<Record<string, unknown>> = []

  let teamItem = teamSummary
  if (teamSummary && filter.q) {
    const term = filter.q.toLowerCase()
    const hay = `${teamSummary.title} ${teamSummary.lastMessage?.preview ?? ''}`.toLowerCase()
    if (!hay.includes(term)) teamItem = null
  }

  if (!participantRows.length) {
    const merged = teamItem ? [teamItem] : []
    const start = (filter.page - 1) * filter.pageSize
    const paged = merged.slice(start, start + filter.pageSize)
    return { items: paged, total: merged.length, page: filter.page, pageSize: filter.pageSize }
  }

  const conversationIds = participantRows.map(r => r.conversationId)
  const lastReadMap = new Map(participantRows.map(r => [r.conversationId, r.lastReadAt]))

  const latestMessageSubquery = db
    .select({
      conversationId: messages.conversationId,
      lastMessageAt: sql<Date>`max(${messages.createdAt})`.as('last_message_at'),
    })
    .from(messages)
    .where(inArray(messages.conversationId, conversationIds))
    .groupBy(messages.conversationId)
    .as('latest_msg')

  const rows = await db.select({
    conversation: conversations,
    lastMessageAt: latestMessageSubquery.lastMessageAt,
  })
    .from(conversations)
    .leftJoin(latestMessageSubquery, eq(latestMessageSubquery.conversationId, conversations.id))
    .where(and(
      inArray(conversations.id, conversationIds),
      eq(conversations.type, 'dm'),
    ))
    .orderBy(desc(sql`coalesce(${latestMessageSubquery.lastMessageAt}, ${conversations.updatedAt})`))

  for (const row of rows) {
    const other = await getOtherParticipant(db, row.conversation.id, filter.userId)
    if (!other) continue

    if (filter.q) {
      const term = filter.q.toLowerCase()
      const hay = `${other.name} ${other.email}`.toLowerCase()
      if (!hay.includes(term)) continue
    }

    const [lastMessage] = await db.select({
      id: messages.id,
      body: messages.body,
      senderUserId: messages.senderUserId,
      createdAt: messages.createdAt,
    })
      .from(messages)
      .where(eq(messages.conversationId, row.conversation.id))
      .orderBy(desc(messages.createdAt))
      .limit(1)

    const lastReadAt = lastReadMap.get(row.conversation.id)
    const unreadCount = lastMessage && (!lastReadAt || lastMessage.createdAt > lastReadAt)
      ? await countUnreadSince(db, row.conversation.id, filter.userId, lastReadAt)
      : 0

    dmItems.push({
      id: row.conversation.id,
      type: row.conversation.type,
      participant: {
        id: other.userId,
        name: other.name,
        email: other.email,
      },
      lastMessage: lastMessage
        ? {
            id: lastMessage.id,
            body: lastMessage.body,
            senderUserId: lastMessage.senderUserId,
            createdAt: lastMessage.createdAt,
            preview: messagePreview(lastMessage.body),
          }
        : null,
      unreadCount,
      updatedAt: row.lastMessageAt ?? row.conversation.updatedAt,
    })
  }

  dmItems.sort((a, b) => new Date(String(b.updatedAt)).getTime() - new Date(String(a.updatedAt)).getTime())
  const merged = teamItem ? [teamItem, ...dmItems] : dmItems

  const start = (filter.page - 1) * filter.pageSize
  const paged = merged.slice(start, start + filter.pageSize)

  return {
    items: paged,
    total: merged.length,
    page: filter.page,
    pageSize: filter.pageSize,
  }
}

async function countUnreadSince(
  db: Db,
  conversationId: string,
  userId: string,
  lastReadAt: Date | null,
) {
  const conditions = [
    eq(messages.conversationId, conversationId),
    ne(messages.senderUserId, userId),
  ]
  if (lastReadAt) conditions.push(gt(messages.createdAt, lastReadAt))

  const [row] = await db.select({ value: count() })
    .from(messages)
    .where(and(...conditions))
  return row?.value ?? 0
}

export async function getConversationDeletionLabel(db: Db, conversationId: string): Promise<string> {
  const [conversation] = await db.select().from(conversations).where(eq(conversations.id, conversationId))
  if (!conversation) throw new MessagesServiceError('NOT_FOUND')

  if (conversation.type === 'email') {
    const [thread] = await db.select({
      subject: emailThreads.subject,
      counterpartName: emailThreads.counterpartName,
      counterpartEmail: emailThreads.counterpartEmail,
    })
      .from(emailThreads)
      .where(eq(emailThreads.conversationId, conversationId))
      .limit(1)
    if (thread?.subject) return thread.subject
    if (thread?.counterpartName) return `Email: ${thread.counterpartName}`
    if (thread?.counterpartEmail) return `Email: ${thread.counterpartEmail}`
    return 'Email thread'
  }

  if (conversation.type === 'team') {
    return conversation.title ?? 'Team'
  }

  const participantRows = await db.select({ name: users.name })
    .from(conversationParticipants)
    .innerJoin(users, eq(conversationParticipants.userId, users.id))
    .where(eq(conversationParticipants.conversationId, conversationId))
    .orderBy(asc(users.name))

  if (participantRows.length) {
    return `DM: ${participantRows.map(r => r.name).join(' & ')}`
  }
  return 'Direct message'
}

export async function getConversationDetail(db: Db, conversationId: string, userId: string) {
  await assertParticipant(db, conversationId, userId)
  const conversation = await getConversationRow(db, conversationId)
  if (!conversation) throw new MessagesServiceError('NOT_FOUND')

  const [participant] = await db.select({ lastReadAt: conversationParticipants.lastReadAt })
    .from(conversationParticipants)
    .where(and(
      eq(conversationParticipants.conversationId, conversationId),
      eq(conversationParticipants.userId, userId),
    ))

  if (conversation.type === 'team') {
    return {
      id: conversation.id,
      type: conversation.type,
      title: conversation.title ?? 'Team',
      isSystem: conversation.isSystem,
      lastReadAt: participant?.lastReadAt ?? null,
      updatedAt: conversation.updatedAt,
    }
  }

  const other = await getOtherParticipant(db, conversationId, userId)
  if (!other) throw new MessagesServiceError('NOT_FOUND')

  return {
    id: conversation.id,
    type: conversation.type,
    participant: {
      id: other.userId,
      name: other.name,
      email: other.email,
    },
    lastReadAt: participant?.lastReadAt ?? null,
    updatedAt: conversation.updatedAt,
  }
}

export interface ListMessagesFilter {
  conversationId: string
  userId: string
  page: number
  pageSize: number
  afterId?: string
}

export async function listMessages(db: Db, filter: ListMessagesFilter) {
  await assertParticipant(db, filter.conversationId, filter.userId)

  const conditions = [eq(messages.conversationId, filter.conversationId)]
  if (filter.afterId) {
    const [anchor] = await db.select({ createdAt: messages.createdAt })
      .from(messages)
      .where(eq(messages.id, filter.afterId))
    if (anchor) conditions.push(gt(messages.createdAt, anchor.createdAt))
  }

  const rows = await db.select({
    message: messages,
    senderName: users.name,
  })
    .from(messages)
    .innerJoin(users, eq(messages.senderUserId, users.id))
    .where(and(...conditions))
    .orderBy(asc(messages.createdAt))
    .limit(filter.afterId ? 100 : filter.pageSize)
    .offset(filter.afterId ? 0 : (filter.page - 1) * filter.pageSize)

  const messageIds = rows.map(r => r.message.id)
  const refs = messageIds.length
    ? await db.select().from(messageEntityRefs).where(inArray(messageEntityRefs.messageId, messageIds))
    : []

  const refsByMessage = new Map<string, typeof refs>()
  for (const ref of refs) {
    const list = refsByMessage.get(ref.messageId) ?? []
    list.push(ref)
    refsByMessage.set(ref.messageId, list)
  }

  const [total] = await db.select({ value: count() })
    .from(messages)
    .where(eq(messages.conversationId, filter.conversationId))

  return {
    items: rows.map(r => ({
      id: r.message.id,
      conversationId: r.message.conversationId,
      body: r.message.body,
      senderUserId: r.message.senderUserId,
      senderName: r.senderName,
      createdAt: r.message.createdAt,
      entityRefs: (refsByMessage.get(r.message.id) ?? []).map(ref => ({
        entityType: ref.entityType,
        entityId: ref.entityId,
        entityLabel: ref.entityLabel,
      })),
    })),
    total: total?.value ?? 0,
    page: filter.page,
    pageSize: filter.pageSize,
  }
}

export async function sendMessage(
  db: Db,
  conversationId: string,
  senderUserId: string,
  body: string,
  explicitRefs?: MessageEntityRefInput[],
) {
  await assertParticipant(db, conversationId, senderUserId)

  const normalizedBody = normalizeOutgoingMessage(body)
  const parsedRefs = parseEntityRefsFromBody(normalizedBody)
  const refs = explicitRefs?.length ? explicitRefs : parsedRefs
  await validateEntityRefs(db, senderUserId, refs)

  const [message] = await db.insert(messages).values({
    conversationId,
    senderUserId,
    body: normalizedBody,
  }).returning()

  if (refs.length) {
    await db.insert(messageEntityRefs).values(
      refs.map((ref, index) => ({
        messageId: message!.id,
        entityType: ref.entityType,
        entityId: ref.entityId,
        entityLabel: ref.entityLabel,
        position: index,
      })),
    )
  }

  await db.update(conversations)
    .set({ updatedAt: new Date() })
    .where(eq(conversations.id, conversationId))

  const [sender] = await db.select({ name: users.name }).from(users).where(eq(users.id, senderUserId))

  const conversation = await getConversationRow(db, conversationId)
  if (conversation?.type !== 'email') {
    const { notifyChatMessageReceived } = await import('./chat-notifications.service')
    void notifyChatMessageReceived(db, {
      conversationId,
      messageId: message!.id,
      senderUserId,
      body: normalizedBody,
      isTeamChat: conversation?.type === 'team',
    }).catch(() => {})
  }

  return {
    id: message!.id,
    conversationId: message!.conversationId,
    body: message!.body,
    senderUserId: message!.senderUserId,
    senderName: sender?.name ?? 'Staff',
    createdAt: message!.createdAt,
    entityRefs: refs,
  }
}

export async function markConversationRead(db: Db, conversationId: string, userId: string) {
  await assertParticipant(db, conversationId, userId)
  const now = new Date()
  await db.update(conversationParticipants)
    .set({ lastReadAt: now })
    .where(and(
      eq(conversationParticipants.conversationId, conversationId),
      eq(conversationParticipants.userId, userId),
    ))
  return { lastReadAt: now }
}

export async function getUnreadCount(db: Db, userId: string) {
  await syncTeamChatParticipants(db)
  const teamSummary = await getTeamConversationSummary(db, userId)
  let total = teamSummary?.unreadCount ?? 0

  const participantRows = await db.select({
    conversationId: conversationParticipants.conversationId,
    lastReadAt: conversationParticipants.lastReadAt,
  })
    .from(conversationParticipants)
    .innerJoin(conversations, eq(conversations.id, conversationParticipants.conversationId))
    .where(and(
      eq(conversationParticipants.userId, userId),
      eq(conversations.type, 'dm'),
    ))

  for (const row of participantRows) {
    total += await countUnreadSince(db, row.conversationId, userId, row.lastReadAt)
  }
  return total
}

export async function listStaffUsers(db: Db, currentUserId: string, filter: { q?: string, page: number, pageSize: number }) {
  const conditions = [
    eq(users.isActive, true),
    isNotNull(users.approvedAt),
    ne(users.id, currentUserId),
    ne(accountTypes.key, 'customer'),
  ]

  if (filter.q) {
    conditions.push(or(
      ilike(users.name, `%${filter.q}%`),
      ilike(users.email, `%${filter.q}%`),
    )!)
  }

  const rows = await db.select({
    id: users.id,
    name: users.name,
    email: users.email,
    accountType: accountTypes.key,
  })
    .from(users)
    .innerJoin(accountTypes, eq(users.accountTypeId, accountTypes.id))
    .where(and(...conditions))
    .orderBy(asc(users.name))
    .limit(filter.pageSize)
    .offset((filter.page - 1) * filter.pageSize)

  const [total] = await db.select({ value: count() })
    .from(users)
    .innerJoin(accountTypes, eq(users.accountTypeId, accountTypes.id))
    .where(and(...conditions))

  return { items: rows, total: total?.value ?? 0, page: filter.page, pageSize: filter.pageSize }
}

export async function searchEntitiesForMessage(
  db: Db,
  userId: string,
  type: MessageEntityType,
  q?: string,
  page = 1,
  pageSize = 10,
) {
  const term = q?.trim()
  switch (type) {
    case 'customer': {
      const conditions = [isNull(customers.archivedAt)]
      if (term) {
        conditions.push(or(
          ilike(customers.displayName, `%${term}%`),
          ilike(customers.email, `%${term}%`),
        )!)
      }
      const rows = await db.select({
        id: customers.id,
        label: customers.displayName,
        sublabel: customers.email,
      })
        .from(customers)
        .where(and(...conditions))
        .orderBy(asc(customers.displayName))
        .limit(pageSize)
        .offset((page - 1) * pageSize)
      return { items: rows.map(r => ({ ...r, entityType: 'customer' as const })) }
    }
    case 'vehicle': {
      const conditions = [isNull(vehicles.archivedAt)]
      if (term) {
        conditions.push(or(
          ilike(vehicles.busNumber, `%${term}%`),
          ilike(vehicles.unitTag, `%${term}%`),
          ilike(vehicles.vin, `%${term}%`),
          ilike(vehicles.make, `%${term}%`),
          ilike(vehicles.model, `%${term}%`),
        )!)
      }
      const rows = await db.select({
        id: vehicles.id,
        busNumber: vehicles.busNumber,
        unitTag: vehicles.unitTag,
        make: vehicles.make,
        model: vehicles.model,
        customerName: customers.displayName,
      })
        .from(vehicles)
        .leftJoin(customers, eq(vehicles.customerId, customers.id))
        .where(and(...conditions))
        .orderBy(asc(vehicles.busNumber))
        .limit(pageSize)
        .offset((page - 1) * pageSize)
      return {
        items: rows.map((r) => {
          const tag = r.unitTag || r.busNumber
          const label = tag ? `Unit ${tag}` : 'Vehicle'
          const sublabel = [r.make, r.model, r.customerName].filter(Boolean).join(' · ')
          return { id: r.id, label, sublabel, entityType: 'vehicle' as const }
        }),
      }
    }
    case 'invoice': {
      const conditions = [isNull(invoices.archivedAt)]
      if (term) {
        conditions.push(or(
          ilike(customers.displayName, `%${term}%`),
          sql`CAST(${invoices.invoiceNumber} AS TEXT) ILIKE ${`%${term.replace(/^inv-?/i, '')}%`}`,
        )!)
      }
      const rows = await db.select({
        id: invoices.id,
        invoiceNumber: invoices.invoiceNumber,
        customerName: customers.displayName,
        status: invoices.status,
      })
        .from(invoices)
        .leftJoin(customers, eq(invoices.customerId, customers.id))
        .where(and(...conditions))
        .orderBy(desc(invoices.createdAt))
        .limit(pageSize)
        .offset((page - 1) * pageSize)
      return {
        items: rows.map(r => ({
          id: r.id,
          label: formatInvoiceNumber(r.invoiceNumber),
          sublabel: [r.customerName, r.status].filter(Boolean).join(' · '),
          entityType: 'invoice' as const,
        })),
      }
    }
    case 'service_log': {
      const conditions = [isNull(serviceLogs.archivedAt)]
      if (term) {
        const num = term.replace(/^sl-?/i, '')
        conditions.push(or(
          ilike(customers.displayName, `%${term}%`),
          ilike(vehicles.busNumber, `%${term}%`),
          sql`CAST(${serviceLogs.logNumber} AS TEXT) ILIKE ${`%${num}%`}`,
        )!)
      }
      const rows = await db.select({
        id: serviceLogs.id,
        logNumber: serviceLogs.logNumber,
        customerName: customers.displayName,
        busNumber: vehicles.busNumber,
        status: serviceLogs.status,
      })
        .from(serviceLogs)
        .leftJoin(customers, eq(serviceLogs.customerId, customers.id))
        .leftJoin(vehicles, eq(serviceLogs.vehicleId, vehicles.id))
        .where(and(...conditions))
        .orderBy(desc(serviceLogs.createdAt))
        .limit(pageSize)
        .offset((page - 1) * pageSize)
      return {
        items: rows.map(r => ({
          id: r.id,
          label: `SL-${r.logNumber}`,
          sublabel: [r.customerName, r.busNumber ? `Unit ${r.busNumber}` : null, r.status].filter(Boolean).join(' · '),
          entityType: 'service_log' as const,
        })),
      }
    }
    default:
      return { items: [] }
  }
}

async function validateEntityRefs(db: Db, userId: string, refs: MessageEntityRefInput[]) {
  for (const ref of refs) {
    const exists = await entityExists(db, ref.entityType, ref.entityId)
    if (!exists) throw new MessagesServiceError('ENTITY_NOT_FOUND')
  }
}

async function entityExists(db: Db, type: MessageEntityType, id: string) {
  switch (type) {
    case 'customer': {
      const [row] = await db.select({ id: customers.id }).from(customers).where(eq(customers.id, id))
      return !!row
    }
    case 'vehicle': {
      const [row] = await db.select({ id: vehicles.id }).from(vehicles).where(eq(vehicles.id, id))
      return !!row
    }
    case 'invoice': {
      const [row] = await db.select({ id: invoices.id }).from(invoices).where(eq(invoices.id, id))
      return !!row
    }
    case 'service_log': {
      const [row] = await db.select({ id: serviceLogs.id }).from(serviceLogs).where(eq(serviceLogs.id, id))
      return !!row
    }
    default:
      return false
  }
}

function messagePreview(body: string): string {
  const stripped = body.replace(ENTITY_REF_TOKEN_RE, (_, type: string, _id: string, label: string) => label)
  return stripped.length > 120 ? `${stripped.slice(0, 117)}…` : stripped
}

export { messagePreview }
