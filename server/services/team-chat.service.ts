import { and, count, desc, eq, gt, inArray, isNotNull, ne } from 'drizzle-orm'
import type { Db } from '../db/client'
import { accountTypes, users } from '../db/schema/auth'
import {
  conversationParticipants,
  conversations,
  messageEntityRefs,
  messages,
  type MessageEntityType,
} from '../db/schema/messages'
import type { MessageEntityRefInput } from '../../shared/validators/messages'
import { entityRefToken, messagePreview, parseEntityRefsFromBody } from './messages.service'
import { normalizeOutgoingMessage } from '../../shared/format/outgoing-message'

export const TEAM_CHAT_TITLE = 'Team'

export type TeamChatServiceErrorCode = 'NOT_FOUND' | 'FORBIDDEN' | 'NOT_TEAM_CHAT'

export class TeamChatServiceError extends Error {
  constructor(public readonly code: TeamChatServiceErrorCode) {
    super(code)
  }
}

export async function getDefaultTeamConversationId(db: Db): Promise<string | null> {
  const [row] = await db.select({ id: conversations.id })
    .from(conversations)
    .where(and(
      eq(conversations.type, 'team'),
      eq(conversations.isSystem, true),
    ))
    .limit(1)
  return row?.id ?? null
}

export async function ensureDefaultTeamConversation(db: Db): Promise<string> {
  const existingId = await getDefaultTeamConversationId(db)
  if (existingId) return existingId

  const [conversation] = await db.insert(conversations).values({
    type: 'team',
    title: TEAM_CHAT_TITLE,
    isSystem: true,
  }).returning()

  return conversation!.id
}

export async function listEligibleTeamChatStaffIds(db: Db): Promise<string[]> {
  const rows = await db.select({ id: users.id })
    .from(users)
    .innerJoin(accountTypes, eq(users.accountTypeId, accountTypes.id))
    .where(and(
      eq(users.isActive, true),
      isNotNull(users.approvedAt),
      eq(users.teamChatEnabled, true),
      ne(accountTypes.key, 'customer'),
    ))
  return rows.map(r => r.id)
}

/** Keep default team chat participants in sync with active staff preferences. */
export async function syncTeamChatParticipants(db: Db) {
  const conversationId = await ensureDefaultTeamConversation(db)
  const eligibleIds = await listEligibleTeamChatStaffIds(db)

  const existing = await db.select({
    userId: conversationParticipants.userId,
  })
    .from(conversationParticipants)
    .where(eq(conversationParticipants.conversationId, conversationId))

  const existingIds = new Set(existing.map(r => r.userId))
  const eligibleSet = new Set(eligibleIds)

  const toAdd = eligibleIds.filter(id => !existingIds.has(id))
  if (toAdd.length) {
    await db.insert(conversationParticipants).values(
      toAdd.map(userId => ({ conversationId, userId })),
    )
  }

  const toRemove = [...existingIds].filter(id => !eligibleSet.has(id))
  if (toRemove.length) {
    await db.delete(conversationParticipants)
      .where(and(
        eq(conversationParticipants.conversationId, conversationId),
        inArray(conversationParticipants.userId, toRemove),
      ))
  }

  return conversationId
}

export async function isSystemTeamConversation(db: Db, conversationId: string): Promise<boolean> {
  const [row] = await db.select({
    type: conversations.type,
    isSystem: conversations.isSystem,
  })
    .from(conversations)
    .where(eq(conversations.id, conversationId))
    .limit(1)
  return row?.type === 'team' && row.isSystem === true
}

export async function assertTeamConversationDeletable(db: Db, conversationId: string) {
  if (await isSystemTeamConversation(db, conversationId)) {
    throw new TeamChatServiceError('FORBIDDEN')
  }
}

export async function clearTeamChatHistory(db: Db, conversationId: string, actorUserId: string) {
  if (!await isSystemTeamConversation(db, conversationId)) {
    throw new TeamChatServiceError('NOT_TEAM_CHAT')
  }

  const [participant] = await db.select({ id: conversationParticipants.id })
    .from(conversationParticipants)
    .where(and(
      eq(conversationParticipants.conversationId, conversationId),
      eq(conversationParticipants.userId, actorUserId),
    ))
    .limit(1)
  if (!participant) throw new TeamChatServiceError('FORBIDDEN')

  const msgRows = await db.select({ id: messages.id })
    .from(messages)
    .where(eq(messages.conversationId, conversationId))

  const messageIds = msgRows.map(r => r.id)
  if (messageIds.length) {
    await db.delete(messageEntityRefs).where(inArray(messageEntityRefs.messageId, messageIds))
    await db.delete(messages).where(eq(messages.conversationId, conversationId))
  }

  await db.update(conversations)
    .set({ updatedAt: new Date() })
    .where(eq(conversations.id, conversationId))

  return { cleared: messageIds.length }
}

export async function postTeamChatMessage(
  db: Db,
  opts: {
    senderUserId: string
    body: string
    entityRefs?: MessageEntityRefInput[]
    skipNormalize?: boolean
  },
) {
  const conversationId = await syncTeamChatParticipants(db)
  const normalizedBody = opts.skipNormalize ? opts.body.trim() : normalizeOutgoingMessage(opts.body)
  const parsedRefs = parseEntityRefsFromBody(normalizedBody)
  const refs = opts.entityRefs?.length ? opts.entityRefs : parsedRefs

  const [message] = await db.insert(messages).values({
    conversationId,
    senderUserId: opts.senderUserId,
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

  const { notifyChatMessageReceived } = await import('./chat-notifications.service')
  void notifyChatMessageReceived(db, {
    conversationId,
    messageId: message!.id,
    senderUserId: opts.senderUserId,
    body: normalizedBody,
    isTeamChat: true,
  }).catch(() => {})

  return {
    conversationId,
    messageId: message!.id,
    body: normalizedBody,
    entityRefs: refs,
  }
}

export async function getTeamConversationSummary(db: Db, userId: string) {
  const conversationId = await syncTeamChatParticipants(db)

  const [participant] = await db.select({
    lastReadAt: conversationParticipants.lastReadAt,
  })
    .from(conversationParticipants)
    .where(and(
      eq(conversationParticipants.conversationId, conversationId),
      eq(conversationParticipants.userId, userId),
    ))
    .limit(1)

  if (!participant) return null

  const [lastMessage] = await db.select({
    id: messages.id,
    body: messages.body,
    senderUserId: messages.senderUserId,
    createdAt: messages.createdAt,
  })
    .from(messages)
    .where(eq(messages.conversationId, conversationId))
    .orderBy(desc(messages.createdAt))
    .limit(1)

  const lastReadAt = participant.lastReadAt
  let unreadCount = 0
  if (lastMessage && lastMessage.senderUserId !== userId) {
    if (!lastReadAt || lastMessage.createdAt > lastReadAt) {
      const conditions = [
        eq(messages.conversationId, conversationId),
        ne(messages.senderUserId, userId),
      ]
      if (lastReadAt) conditions.push(gt(messages.createdAt, lastReadAt))
      const [row] = await db.select({ value: count() })
        .from(messages)
        .where(and(...conditions))
      unreadCount = row?.value ?? 0
    }
  }

  const [conversation] = await db.select()
    .from(conversations)
    .where(eq(conversations.id, conversationId))
    .limit(1)

  return {
    id: conversationId,
    type: 'team' as const,
    title: conversation?.title ?? TEAM_CHAT_TITLE,
    isSystem: true,
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
    updatedAt: lastMessage?.createdAt ?? conversation?.updatedAt ?? new Date(),
  }
}

export function buildEntityRef(
  entityType: MessageEntityType,
  entityId: string,
  entityLabel: string,
): MessageEntityRefInput {
  return { entityType, entityId, entityLabel }
}

export { entityRefToken }
