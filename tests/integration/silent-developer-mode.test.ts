// Integration tests for silent developer mode (admin testing without team noise).
import { config } from 'dotenv'
import { eq } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/node-postgres'
import { Pool } from 'pg'
import { afterAll, describe, expect, it } from 'vitest'
import { users } from '../../server/db/schema/auth'
import { messages } from '../../server/db/schema/messages'
import { createCustomer } from '../../server/services/customers.service'
import { shouldSuppressActorNotifications } from '../../server/services/notification-suppression.service'
import { ensureDefaultTeamConversation, postTeamChatMessage } from '../../server/services/team-chat.service'
import { postCustomerCreatedTeamMessage } from '../../server/services/workflow-chat.service'

config()

const pool = new Pool({ connectionString: process.env.DATABASE_URL })
const db = drizzle({ client: pool })

const stamp = Date.now()

const [actor] = await db.select({ id: users.id }).from(users).limit(1)
const ACTOR = actor!.id

let teamConversationId: string | null = null

async function setSilentDeveloperMode(userId: string, enabled: boolean) {
  await db.update(users)
    .set({ silentDeveloperMode: enabled, updatedAt: new Date() })
    .where(eq(users.id, userId))
}

afterAll(async () => {
  if (teamConversationId) {
    await db.delete(messages).where(eq(messages.conversationId, teamConversationId))
  }
  await setSilentDeveloperMode(ACTOR, false)
  await pool.end()
})

describe('silent developer mode', () => {
  it('defaults to off and can be toggled on the account', async () => {
    expect(await shouldSuppressActorNotifications(db, ACTOR)).toBe(false)

    await setSilentDeveloperMode(ACTOR, true)
    expect(await shouldSuppressActorNotifications(db, ACTOR)).toBe(true)

    await setSilentDeveloperMode(ACTOR, false)
    expect(await shouldSuppressActorNotifications(db, ACTOR)).toBe(false)
  })

  it('suppresses workflow team chat but not manual team chat posts', async () => {
    await setSilentDeveloperMode(ACTOR, true)
    teamConversationId = await ensureDefaultTeamConversation(db)

    const beforeCount = await db.select({ id: messages.id })
      .from(messages)
      .where(eq(messages.conversationId, teamConversationId))

    const customer = await createCustomer(db, {
      displayName: `SilentDev-${stamp}`,
      accountKind: 'fleet',
    }, ACTOR)

    const workflow = await postCustomerCreatedTeamMessage(db, {
      senderUserId: ACTOR,
      customerId: customer.id,
      customerName: customer.displayName,
    })
    expect(workflow.suppressed).toBe(true)

    const manual = await postTeamChatMessage(db, {
      senderUserId: ACTOR,
      body: `Manual test note ${stamp}`,
    })
    expect(manual.suppressed).toBeUndefined()
    expect(manual.messageId).toBeTruthy()

    const afterCount = await db.select({ id: messages.id })
      .from(messages)
      .where(eq(messages.conversationId, teamConversationId))

    expect(afterCount.length - beforeCount.length).toBe(1)

    await setSilentDeveloperMode(ACTOR, false)
  })
})
