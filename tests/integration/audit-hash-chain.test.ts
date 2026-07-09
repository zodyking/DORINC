// Integration tests for P3-07 audit hash chain (SPEC §11).
import { config } from 'dotenv'
import { eq, sql } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/node-postgres'
import { Pool } from 'pg'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { AUDIT_CHAIN_LOCK_KEY } from '../../shared/audit-hash'
import { auditLogs } from '../../server/db/schema/audit'
import { backfillAuditHashChain } from '../../server/db/backfill-audit-hash'
import { listAuditLogs } from '../../server/services/audit-logs.service'
import { writeAudit } from '../../server/services/audit.service'
import { users, accountTypes } from '../../server/db/schema/auth'
import type { AccountType } from '../../shared/permissions/keys'

config()

const pool = new Pool({ connectionString: process.env.DATABASE_URL })
const db = drizzle({ client: pool })

const stamp = Date.now()
const marker = `audit-chain-${stamp}`

const [actorRow] = await db
  .select({
    id: users.id,
    name: users.name,
    email: users.email,
    accountType: accountTypes.key,
  })
  .from(users)
  .innerJoin(accountTypes, eq(users.accountTypeId, accountTypes.id))
  .limit(1)

const ACTOR = actorRow!

afterAll(async () => {
  await pool.end()
})

describe.sequential('audit hash chain (P3-07)', () => {
  beforeAll(async () => {
    await backfillAuditHashChain()
  })

  it('writes chained rows via writeAudit with previous_hash and entry_hash', async () => {
    const actor = {
      id: ACTOR.id,
      accountType: ACTOR.accountType as AccountType,
      name: ACTOR.name,
      email: ACTOR.email,
    }

    await writeAudit(null, {
      entityType: 'test',
      entityId: `${marker}-a`,
      action: 'integration.hash_chain.a',
      actor,
      afterData: { marker, step: 'a' },
      requestId: `${marker}-a`,
    })

    await writeAudit(null, {
      entityType: 'test',
      entityId: `${marker}-b`,
      action: 'integration.hash_chain.b',
      actor,
      afterData: { marker, step: 'b' },
      requestId: `${marker}-b`,
    })

    const [rowA] = await db.select({
      entryHash: auditLogs.entryHash,
    })
      .from(auditLogs)
      .where(eq(auditLogs.requestId, `${marker}-a`))

    const [rowB] = await db.select({
      previousHash: auditLogs.previousHash,
      entryHash: auditLogs.entryHash,
    })
      .from(auditLogs)
      .where(eq(auditLogs.requestId, `${marker}-b`))

    expect(rowA?.entryHash).toBeTruthy()
    expect(rowB?.previousHash).toBeTruthy()
    expect(rowB?.entryHash).toBeTruthy()
  })

  it('verifies chain integrity on listAuditLogs query', async () => {
    const result = await listAuditLogs(db, {
      q: `${marker}-b`,
      page: 1,
      pageSize: 5,
    })

    expect(result.items).toHaveLength(1)
    expect(result.chainVerification.status).toBe('valid')
    expect(result.chainVerification.brokenEntryId).toBeNull()
  })

  it('detects tampering when entry_hash no longer matches payload', async () => {
    const [row] = await db.select({ id: auditLogs.id, entryHash: auditLogs.entryHash })
      .from(auditLogs)
      .where(eq(auditLogs.requestId, `${marker}-a`))

    const originalHash = row!.entryHash!
    const lastChar = originalHash.slice(-1)
    const tamperedHash = `${originalHash.slice(0, -1)}${lastChar === 'a' ? 'b' : 'a'}`

    await db.execute(sql`SELECT pg_advisory_lock(${AUDIT_CHAIN_LOCK_KEY})`)
    try {
      await db.execute(sql`ALTER TABLE audit_logs DISABLE TRIGGER audit_logs_no_update_delete`)
      try {
        await db.update(auditLogs)
          .set({ entryHash: tamperedHash })
          .where(eq(auditLogs.id, row!.id))
      }
      finally {
        await db.execute(sql`ALTER TABLE audit_logs ENABLE TRIGGER audit_logs_no_update_delete`)
      }
    }
    finally {
      await db.execute(sql`SELECT pg_advisory_unlock(${AUDIT_CHAIN_LOCK_KEY})`)
    }

    try {
      const result = await listAuditLogs(db, {
        q: marker,
        page: 1,
        pageSize: 20,
      })

      expect(result.chainVerification.status).toBe('broken')
      expect(result.chainVerification.brokenEntryId).toBe(row!.id)
    }
    finally {
      await db.execute(sql`SELECT pg_advisory_lock(${AUDIT_CHAIN_LOCK_KEY})`)
      try {
        await db.execute(sql`ALTER TABLE audit_logs DISABLE TRIGGER audit_logs_no_update_delete`)
        try {
          await db.update(auditLogs)
            .set({ entryHash: originalHash })
            .where(eq(auditLogs.id, row!.id))
        }
        finally {
          await db.execute(sql`ALTER TABLE audit_logs ENABLE TRIGGER audit_logs_no_update_delete`)
        }
      }
      finally {
        await db.execute(sql`SELECT pg_advisory_unlock(${AUDIT_CHAIN_LOCK_KEY})`)
      }
    }
  })
})
