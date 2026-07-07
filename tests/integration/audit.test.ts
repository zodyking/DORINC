// Integration test against the real dev PostgreSQL (DATABASE_URL from .env).
import { config } from 'dotenv'
import { eq, sql } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/node-postgres'
import { Pool } from 'pg'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { auditLogs } from '../../server/db/schema/audit'

config()

const pool = new Pool({ connectionString: process.env.DATABASE_URL })
const db = drizzle({ client: pool })

const marker = `audit-test-${Date.now()}`

describe('audit_logs append-only integration', () => {
  beforeAll(async () => {
    await db.execute(sql`select 1`)
  })

  afterAll(async () => {
    await pool.end()
  })

  it('inserts an audit row with actor snapshot and request id', async () => {
    const [row] = await db.insert(auditLogs).values({
      entityType: 'test',
      entityId: marker,
      action: 'integration.test',
      actorName: 'Vitest',
      actorEmail: 'vitest@dorinc.local',
      actorAccountType: 'super_admin',
      permissionKey: 'system.admin.all',
      riskLevel: 'normal',
      requestId: 'req-test-1',
    }).returning()

    expect(row).toBeDefined()
    expect(row!.entityId).toBe(marker)
    expect(row!.requestId).toBe('req-test-1')
    expect(row!.createdAt).toBeInstanceOf(Date)
  })

  it('rejects UPDATE at the database level', async () => {
    const err = await db.update(auditLogs)
      .set({ action: 'tampered' })
      .where(eq(auditLogs.entityId, marker))
      .then(() => null, e => e as Error & { cause?: Error })
    expect(err).not.toBeNull()
    expect(`${err!.message} ${err!.cause?.message ?? ''}`).toMatch(/append-only/)
  })

  it('rejects DELETE at the database level', async () => {
    const err = await db.delete(auditLogs)
      .where(eq(auditLogs.entityId, marker))
      .then(() => null, e => e as Error & { cause?: Error })
    expect(err).not.toBeNull()
    expect(`${err!.message} ${err!.cause?.message ?? ''}`).toMatch(/append-only/)
  })
})
