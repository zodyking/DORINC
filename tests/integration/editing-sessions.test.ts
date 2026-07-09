// Integration tests for editing sessions (P1-24 / P1-31 / SPEC §12).
import { config } from 'dotenv'
import { eq } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/node-postgres'
import { Pool } from 'pg'
import { afterAll, describe, expect, it } from 'vitest'
import { createCustomer } from '../../server/services/customers.service'
import { createInvoice } from '../../server/services/invoices.service'
import {
  acquireEditingSession,
  adminForceReleaseEditingSession,
  assertEditingSessionHolder,
  EDIT_SESSION_STALE_MS,
  getActiveEditingSession,
  heartbeatEditingSession,
  releaseEditingSession,
} from '../../server/services/editing-sessions.service'
import { editingSessions } from '../../server/db/schema/editing-sessions'
import { users } from '../../server/db/schema/auth'

config()

const pool = new Pool({ connectionString: process.env.DATABASE_URL })
const db = drizzle({ client: pool })

const stamp = Date.now()
const [userA] = await db.select({ id: users.id, name: users.name }).from(users).limit(1)
const [userB] = await db.select({ id: users.id, name: users.name }).from(users).offset(1).limit(1)

const ACTOR_A = userA!.id
const ACTOR_B = userB?.id ?? userA!.id
const NAME_A = userA!.name
const NAME_B = userB?.name ?? `${userA!.name} B`

const customer = await createCustomer(db, {
  displayName: `EditSess-${stamp}`,
  accountKind: 'individual',
}, ACTOR_A)

const invoice = await createInvoice(db, {
  creationSource: 'customer',
  customerId: customer.id,
  invoiceDate: '2026-07-08',
  paymentTerms: 'net_30',
}, ACTOR_A)

afterAll(async () => {
  await db.delete(editingSessions).where(eq(editingSessions.entityId, invoice.id))
  await pool.end()
})

describe('editing sessions (P1-24 / P1-31)', () => {
  it('acquires and heartbeats a session for the holder', async () => {
    const session = await acquireEditingSession(db, 'invoice', invoice.id, ACTOR_A, NAME_A)
    expect(session.userId).toBe(ACTOR_A)

    const active = await getActiveEditingSession(db, 'invoice', invoice.id)
    expect(active?.id).toBe(session.id)

    await assertEditingSessionHolder(db, 'invoice', invoice.id, ACTOR_A)

    const beat = await heartbeatEditingSession(db, session.id, ACTOR_A)
    expect(beat.lastHeartbeatAt).toBeTruthy()

    await releaseEditingSession(db, session.id, ACTOR_A)
    expect(await getActiveEditingSession(db, 'invoice', invoice.id)).toBeNull()
  })

  it('blocks a second user while a session is active', async () => {
    const session = await acquireEditingSession(db, 'invoice', invoice.id, ACTOR_A, NAME_A)

    await expect(
      acquireEditingSession(db, 'invoice', invoice.id, ACTOR_B, NAME_B),
    ).rejects.toMatchObject({ code: 'SESSION_ACTIVE' })

    await expect(
      assertEditingSessionHolder(db, 'invoice', invoice.id, ACTOR_B),
    ).rejects.toMatchObject({ code: 'SESSION_ACTIVE' })

    await releaseEditingSession(db, session.id, ACTOR_A)
  })

  it('allows the same user to re-acquire after release', async () => {
    const first = await acquireEditingSession(db, 'invoice', invoice.id, ACTOR_A, NAME_A)
    await releaseEditingSession(db, first.id, ACTOR_A)

    const second = await acquireEditingSession(db, 'invoice', invoice.id, ACTOR_A, NAME_A)
    expect(second.id).not.toBe(first.id)

    await releaseEditingSession(db, second.id, ACTOR_A)
  })

  it('purges stale sessions after missed heartbeats', async () => {
    const session = await acquireEditingSession(db, 'invoice', invoice.id, ACTOR_A, NAME_A)

    const staleAt = new Date(Date.now() - EDIT_SESSION_STALE_MS - 5_000)
    await db.update(editingSessions)
      .set({ lastHeartbeatAt: staleAt })
      .where(eq(editingSessions.id, session.id))

    expect(await getActiveEditingSession(db, 'invoice', invoice.id)).toBeNull()

    const next = await acquireEditingSession(db, 'invoice', invoice.id, ACTOR_B, NAME_B)
    await releaseEditingSession(db, next.id, ACTOR_B)
  })

  it('rejects heartbeat on a stale session', async () => {
    const session = await acquireEditingSession(db, 'invoice', invoice.id, ACTOR_A, NAME_A)

    const staleAt = new Date(Date.now() - EDIT_SESSION_STALE_MS - 5_000)
    await db.update(editingSessions)
      .set({ lastHeartbeatAt: staleAt })
      .where(eq(editingSessions.id, session.id))

    await expect(
      heartbeatEditingSession(db, session.id, ACTOR_A),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' })

    expect(await getActiveEditingSession(db, 'invoice', invoice.id)).toBeNull()
  })

  it('allows admin to force-release an active session', async () => {
    const session = await acquireEditingSession(db, 'invoice', invoice.id, ACTOR_A, NAME_A)

    const result = await adminForceReleaseEditingSession(
      db,
      session.id,
      ACTOR_B,
      'User closed browser without releasing',
    )

    expect(result.ok).toBe(true)
    expect(result.releasedSession.holderUserId).toBe(ACTOR_A)
    expect(await getActiveEditingSession(db, 'invoice', invoice.id)).toBeNull()

    const next = await acquireEditingSession(db, 'invoice', invoice.id, ACTOR_B, NAME_B)
    await releaseEditingSession(db, next.id, ACTOR_B)
  })
})
