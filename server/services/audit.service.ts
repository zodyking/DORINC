import { randomUUID } from 'node:crypto'
import type { H3Event } from 'h3'
import { getHeader } from 'h3'
import { getClientIp } from '../utils/client-ip'
import { desc, sql } from 'drizzle-orm'
import { useDb, type Db } from '../db/client'
import { auditLogs } from '../db/schema/audit'
import type { PermissionUser } from '../../shared/permissions/evaluate'
import {
  AUDIT_CHAIN_LOCK_KEY,
  AUDIT_GENESIS_HASH,
  buildAuditHashPayload,
  computeAuditEntryHash,
} from '../../shared/audit-hash'

export type AuditRiskLevel = 'normal' | 'sensitive' | 'high'

export interface AuditEntry {
  entityType: string
  entityId?: string | null
  action: string
  beforeData?: unknown
  afterData?: unknown
  changedFields?: string[]
  actor?: Pick<PermissionUser, 'id' | 'accountType'> & { name?: string, email?: string } | null
  permissionKey?: string
  riskLevel?: AuditRiskLevel
  requestId?: string | null
}

async function latestEntryHash(tx: Pick<Db, 'select'>): Promise<string> {
  const rows = await tx.select({ entryHash: auditLogs.entryHash })
    .from(auditLogs)
    .orderBy(desc(auditLogs.createdAt), desc(auditLogs.id))
    .limit(50)

  for (const row of rows) {
    if (row.entryHash) return row.entryHash
  }

  return AUDIT_GENESIS_HASH
}

async function nextAuditCreatedAt(tx: Pick<Db, 'select'>): Promise<Date> {
  const [latest] = await tx.select({ createdAt: auditLogs.createdAt })
    .from(auditLogs)
    .orderBy(desc(auditLogs.createdAt), desc(auditLogs.id))
    .limit(1)

  const now = new Date()
  if (!latest?.createdAt) return now

  const nextMs = latest.createdAt.getTime() + 1
  return nextMs > now.getTime() ? new Date(nextMs) : now
}

/**
 * Append an audit row (SPEC §11). This service intentionally exposes
 * WRITE ONLY — there is no update or delete path, and the DB trigger
 * `audit_logs_immutable` rejects mutations at the database level.
 * Each row links to the prior entry via previous_hash / entry_hash (P3-07).
 */
export async function writeAudit(event: H3Event | null, entry: AuditEntry): Promise<void> {
  const db = useDb()

  if (entry.actor === undefined && event) {
    const auth = event.context.auth as { user?: PermissionUser & { name?: string, email?: string } } | undefined
    if (auth?.user) entry = { ...entry, actor: auth.user }
  }

  const id = randomUUID()
  const ipAddress = event ? getClientIp(event) : null
  const userAgent = event ? getHeader(event, 'user-agent') ?? null : null
  const requestId = entry.requestId !== undefined
    ? entry.requestId
    : (event ? ((event.context.requestId as string | undefined) ?? null) : null)

  await db.transaction(async (tx) => {
    await tx.execute(sql`SELECT pg_advisory_xact_lock(${AUDIT_CHAIN_LOCK_KEY})`)

    const previousHash = await latestEntryHash(tx)
    const createdAt = await nextAuditCreatedAt(tx)
    const payload = buildAuditHashPayload({
      id,
      entityType: entry.entityType,
      entityId: entry.entityId ?? null,
      action: entry.action,
      beforeData: entry.beforeData ?? null,
      afterData: entry.afterData ?? null,
      changedFields: entry.changedFields ?? null,
      actorUserId: entry.actor?.id ?? null,
      actorName: entry.actor?.name ?? null,
      actorEmail: entry.actor?.email ?? null,
      actorAccountType: entry.actor?.accountType ?? null,
      permissionKey: entry.permissionKey ?? null,
      riskLevel: entry.riskLevel ?? 'normal',
      ipAddress,
      userAgent,
      requestId,
      createdAt,
    })
    const entryHash = computeAuditEntryHash(previousHash, payload)

    await tx.insert(auditLogs).values({
      id,
      entityType: entry.entityType,
      entityId: entry.entityId ?? null,
      action: entry.action,
      beforeData: entry.beforeData ?? null,
      afterData: entry.afterData ?? null,
      changedFields: entry.changedFields ?? null,
      actorUserId: entry.actor?.id ?? null,
      actorName: entry.actor?.name ?? null,
      actorEmail: entry.actor?.email ?? null,
      actorAccountType: entry.actor?.accountType ?? null,
      permissionKey: entry.permissionKey ?? null,
      riskLevel: entry.riskLevel ?? 'normal',
      ipAddress,
      userAgent,
      requestId,
      previousHash,
      entryHash,
      createdAt,
    })
  })
}
