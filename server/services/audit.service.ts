import type { H3Event } from 'h3'
import { getHeader, getRequestIP } from 'h3'
import { useDb } from '../db/client'
import { auditLogs } from '../db/schema/audit'
import type { PermissionUser } from '../../shared/permissions/evaluate'

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
}

/**
 * Append an audit row (SPEC §11). This service intentionally exposes
 * WRITE ONLY — there is no update or delete path, and the DB trigger
 * `audit_logs_immutable` rejects mutations at the database level.
 */
export async function writeAudit(event: H3Event | null, entry: AuditEntry): Promise<void> {
  const db = useDb()

  // Default the actor snapshot to the authenticated user on this request
  if (entry.actor === undefined && event) {
    const auth = event.context.auth as { user?: PermissionUser & { name?: string, email?: string } } | undefined
    if (auth?.user) entry = { ...entry, actor: auth.user }
  }

  await db.insert(auditLogs).values({
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
    ipAddress: event ? getRequestIP(event, { xForwardedFor: true }) ?? null : null,
    userAgent: event ? getHeader(event, 'user-agent') ?? null : null,
    requestId: event ? ((event.context.requestId as string | undefined) ?? null) : null,
  })
}
