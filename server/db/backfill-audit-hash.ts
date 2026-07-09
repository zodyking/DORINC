import { config } from 'dotenv'
import { asc, eq, sql } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/node-postgres'
import { Pool } from 'pg'
import { auditLogs } from './schema/audit'
import {
  AUDIT_CHAIN_LOCK_KEY,
  AUDIT_GENESIS_HASH,
  buildAuditHashPayload,
  computeAuditEntryHash,
} from '../../shared/audit-hash'

config()

let pool: Pool | undefined

function getDb() {
  if (!pool) {
    pool = new Pool({ connectionString: process.env.DATABASE_URL })
  }
  return drizzle({ client: pool })
}

/**
 * Backfill hash chain fields for audit rows written before P3-07.
 * Temporarily disables the append-only trigger because legacy rows need a one-time UPDATE.
 */
export async function backfillAuditHashChain(): Promise<{ updated: number, skipped: number }> {
  const db = getDb()
  await db.execute(sql`SELECT pg_advisory_lock(${AUDIT_CHAIN_LOCK_KEY})`)

  try {
    await db.execute(sql`ALTER TABLE audit_logs DISABLE TRIGGER audit_logs_no_update_delete`)

    try {
      const rows = await db.select({
        id: auditLogs.id,
        entityType: auditLogs.entityType,
        entityId: auditLogs.entityId,
        action: auditLogs.action,
        beforeData: auditLogs.beforeData,
        afterData: auditLogs.afterData,
        changedFields: auditLogs.changedFields,
        actorUserId: auditLogs.actorUserId,
        actorName: auditLogs.actorName,
        actorEmail: auditLogs.actorEmail,
        actorAccountType: auditLogs.actorAccountType,
        permissionKey: auditLogs.permissionKey,
        riskLevel: auditLogs.riskLevel,
        ipAddress: auditLogs.ipAddress,
        userAgent: auditLogs.userAgent,
        requestId: auditLogs.requestId,
        createdAt: auditLogs.createdAt,
        previousHash: auditLogs.previousHash,
        entryHash: auditLogs.entryHash,
      })
        .from(auditLogs)
        .orderBy(asc(auditLogs.createdAt), asc(auditLogs.id))

      let rollingPrevious = AUDIT_GENESIS_HASH
      let updated = 0
      let skipped = 0

      for (const row of rows) {
        const payload = buildAuditHashPayload({
          ...row,
          ipAddress: row.ipAddress ? String(row.ipAddress) : null,
        })
        const entryHash = computeAuditEntryHash(rollingPrevious, payload)

        if (row.entryHash === entryHash && row.previousHash === rollingPrevious) {
          rollingPrevious = entryHash
          skipped++
          continue
        }

        await db.update(auditLogs)
          .set({ previousHash: rollingPrevious, entryHash })
          .where(eq(auditLogs.id, row.id))

        rollingPrevious = entryHash
        updated++
      }

      return { updated, skipped }
    }
    finally {
      await db.execute(sql`ALTER TABLE audit_logs ENABLE TRIGGER audit_logs_no_update_delete`)
    }
  }
  finally {
    await db.execute(sql`SELECT pg_advisory_unlock(${AUDIT_CHAIN_LOCK_KEY})`)
  }
}

async function main() {
  const result = await backfillAuditHashChain()
  console.log(`Audit hash backfill complete: updated=${result.updated}, skipped=${result.skipped}`)
  if (pool) await pool.end()
}

const invokedDirectly = process.argv[1]?.replace(/\\/g, '/').endsWith('server/db/backfill-audit-hash.ts')

if (invokedDirectly) {
  main().catch((err) => {
    console.error(err)
    process.exit(1)
  })
}
