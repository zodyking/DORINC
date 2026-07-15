// Integration tests for staff direct messages.
import { config } from 'dotenv'
import { eq } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/node-postgres'
import { Pool } from 'pg'
import { afterAll, describe, expect, it } from 'vitest'
import { users } from '../../server/db/schema/auth'
import { customers } from '../../server/db/schema/customers'
import {
  conversationParticipants,
  conversations,
  messageEntityRefs,
  messages,
} from '../../server/db/schema/messages'
import {
  createOrGetDmConversation,
  entityRefToken,
  getUnreadCount,
  listMessages,
  markConversationRead,
  parseEntityRefsFromBody,
  sendMessage,
} from '../../server/services/messages.service'

config()

const pool = new Pool({ connectionString: process.env.DATABASE_URL })
const db = drizzle({ client: pool })

const [userA] = await db.select({ id: users.id }).from(users).limit(1)
const [userB] = await db.select({ id: users.id }).from(users).offset(1).limit(1)

const ACTOR_A = userA!.id
const ACTOR_B = userB?.id ?? userA!.id

const createdConversationIds: string[] = []

afterAll(async () => {
  for (const id of createdConversationIds) {
    const msgRows = await db.select({ id: messages.id }).from(messages).where(eq(messages.conversationId, id))
    for (const row of msgRows) {
      await db.delete(messageEntityRefs).where(eq(messageEntityRefs.messageId, row.id))
    }
    await db.delete(messages).where(eq(messages.conversationId, id))
    await db.delete(conversationParticipants).where(eq(conversationParticipants.conversationId, id))
    await db.delete(conversations).where(eq(conversations.id, id))
  }
  await pool.end()
})

describe('direct messages', () => {
  it('creates a DM and reuses the same thread', async () => {
    const first = await createOrGetDmConversation(db, ACTOR_A, ACTOR_B)
    createdConversationIds.push(first.id)
    const second = await createOrGetDmConversation(db, ACTOR_A, ACTOR_B)
    expect(second.id).toBe(first.id)
  })

  it('sends messages with entity reference tokens', async () => {
    const conv = await createOrGetDmConversation(db, ACTOR_A, ACTOR_B)
    if (!createdConversationIds.includes(conv.id)) createdConversationIds.push(conv.id)

    const [customer] = await db.select({ id: customers.id, displayName: customers.displayName }).from(customers).limit(1)
    expect(customer).toBeTruthy()

    const token = entityRefToken({
      entityType: 'customer',
      entityId: customer!.id,
      entityLabel: customer!.displayName,
    })
    const body = `Please review ${token}`
    const refs = parseEntityRefsFromBody(body)
    expect(refs).toHaveLength(1)

    const sent = await sendMessage(db, conv.id, ACTOR_A, body, refs)
    expect(sent.body).toContain('[[ref:customer:')

    const listed = await listMessages(db, {
      conversationId: conv.id,
      userId: ACTOR_B,
      page: 1,
      pageSize: 20,
    })
    expect(listed.items.some(m => m.id === sent.id)).toBe(true)
    expect(listed.items.find(m => m.id === sent.id)?.entityRefs[0]?.entityLabel).toBe(customer!.displayName)
  })

  it('tracks unread counts and clears on read', async () => {
    const conv = await createOrGetDmConversation(db, ACTOR_A, ACTOR_B)
    if (!createdConversationIds.includes(conv.id)) createdConversationIds.push(conv.id)

    await sendMessage(db, conv.id, ACTOR_A, 'Ping unread test')
    const before = await getUnreadCount(db, ACTOR_B)
    expect(before).toBeGreaterThan(0)

    await markConversationRead(db, conv.id, ACTOR_B)
    const after = await getUnreadCount(db, ACTOR_B)
    expect(after).toBeLessThan(before)
  })
})
