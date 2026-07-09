// Integration tests for audit log listing (P1-33).
import { config } from 'dotenv'
import { drizzle } from 'drizzle-orm/node-postgres'
import { Pool } from 'pg'
import { afterAll, describe, expect, it } from 'vitest'
import { auditLogs } from '../../server/db/schema/audit'
import { listAuditLogs } from '../../server/services/audit-logs.service'
import { users } from '../../server/db/schema/auth'

config()

const pool = new Pool({ connectionString: process.env.DATABASE_URL })
const db = drizzle({ client: pool })

const stamp = Date.now()
const marker = `audit-list-${stamp}`

const [anyUser] = await db.select({ id: users.id }).from(users).limit(1)
const ACTOR_ID = anyUser!.id

afterAll(async () => {
  await pool.end()
})

describe('audit log listing (P1-33)', () => {
  it('filters by entity, action, user, date, and search', async () => {
    await db.insert(auditLogs).values([
      {
        entityType: 'customer',
        entityId: `${marker}-1`,
        action: 'customers.create',
        actorUserId: ACTOR_ID,
        actorName: `AuditList-${stamp}`,
        actorEmail: `audit-${stamp}@dorinc.local`,
        afterData: { displayName: `Customer ${stamp}` },
        riskLevel: 'normal',
        createdAt: new Date('2026-07-01T10:00:00.000Z'),
      },
      {
        entityType: 'auth',
        entityId: null,
        action: 'auth.login',
        actorUserId: ACTOR_ID,
        actorName: `AuditList-${stamp}`,
        actorEmail: `audit-${stamp}@dorinc.local`,
        riskLevel: 'sensitive',
        createdAt: new Date('2026-07-05T14:00:00.000Z'),
      },
      {
        entityType: 'invoice',
        entityId: `${marker}-2`,
        action: 'invoices.create',
        actorName: 'Other User',
        riskLevel: 'normal',
        createdAt: new Date('2026-07-08T09:00:00.000Z'),
      },
    ])

    const byEntity = await listAuditLogs(db, {
      entityType: 'customer',
      q: marker,
      page: 1,
      pageSize: 50,
    })
    expect(byEntity.items.some(r => r.entityId === `${marker}-1`)).toBe(true)

    const byAction = await listAuditLogs(db, {
      action: 'auth.login',
      page: 1,
      pageSize: 50,
    })
    expect(byAction.items.some(r => r.action === 'auth.login' && r.actorUserId === ACTOR_ID)).toBe(true)

    const byUser = await listAuditLogs(db, {
      actorUserId: ACTOR_ID,
      q: marker,
      page: 1,
      pageSize: 50,
    })
    expect(byUser.items.every(r => r.actorUserId === ACTOR_ID)).toBe(true)
    expect(byUser.items.some(r => r.entityId === `${marker}-1`)).toBe(true)

    const byDate = await listAuditLogs(db, {
      dateFrom: '2026-07-04',
      dateTo: '2026-07-06',
      page: 1,
      pageSize: 50,
    })
    expect(byDate.items.some(r => r.action === 'auth.login')).toBe(true)
    expect(byDate.items.some(r => r.entityId === `${marker}-1`)).toBe(false)

    const bySearch = await listAuditLogs(db, {
      q: `Customer ${stamp}`,
      page: 1,
      pageSize: 50,
    })
    expect(bySearch.items.some(r => r.entityId === `${marker}-1`)).toBe(true)

    const security = await listAuditLogs(db, {
      category: 'security',
      page: 1,
      pageSize: 50,
    })
    expect(security.items.some(r => r.action === 'auth.login')).toBe(true)
  })

  it('returns newest entries first with pagination metadata', async () => {
    const page = await listAuditLogs(db, {
      q: marker,
      page: 1,
      pageSize: 1,
    })
    expect(page.total).toBeGreaterThanOrEqual(1)
    expect(page.items).toHaveLength(1)
    expect(page.page).toBe(1)
    expect(page.pageSize).toBe(1)
  })
})
