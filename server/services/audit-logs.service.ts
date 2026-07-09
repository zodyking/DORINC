import { and, count, desc, eq, gte, ilike, lte, or, sql } from 'drizzle-orm'
import type { Db } from '../db/client'
import { auditLogs } from '../db/schema/audit'
import type { AuditListQuery } from '../../shared/validators/audit'
import {
  type AuditChainVerification,
  type AuditHashRow,
  buildAuditHashPayload,
  verifyAuditChainRows,
} from '../../shared/audit-hash'

export interface ListAuditLogsFilter {
  q?: string
  entityType?: string
  action?: string
  actorUserId?: string
  dateFrom?: string
  dateTo?: string
  category?: AuditListQuery['category']
  page: number
  pageSize: number
}

export interface AuditLogListItem {
  id: string
  entityType: string
  entityId: string | null
  action: string
  actorUserId: string | null
  actorName: string | null
  actorEmail: string | null
  actorAccountType: string | null
  changedFields: unknown
  afterData: unknown
  beforeData: unknown
  riskLevel: string
  ipAddress: string | null
  userAgent: string | null
  permissionKey: string | null
  requestId: string | null
  previousHash: string | null
  entryHash: string | null
  createdAt: Date
}

function toAuditHashRow(row: AuditLogListItem): AuditHashRow {
  return {
    ...buildAuditHashPayload({
      ...row,
      ipAddress: row.ipAddress ? String(row.ipAddress) : null,
    }),
    previousHash: row.previousHash,
    entryHash: row.entryHash,
  }
}

async function fetchPredecessor(db: Db, oldest: AuditLogListItem): Promise<AuditHashRow | null> {
  const [prior] = await db.select({
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
    .where(sql`(${auditLogs.createdAt}, ${auditLogs.id}) < (${oldest.createdAt}, ${oldest.id})`)
    .orderBy(desc(auditLogs.createdAt), desc(auditLogs.id))
    .limit(1)

  if (!prior) return null

  return {
    ...buildAuditHashPayload({
      ...prior,
      ipAddress: prior.ipAddress ? String(prior.ipAddress) : null,
    }),
    previousHash: prior.previousHash,
    entryHash: prior.entryHash,
  }
}

async function verifyListedAuditRows(db: Db, rows: AuditLogListItem[]): Promise<AuditChainVerification> {
  if (!rows.length) {
    return { status: 'valid', checked: 0, brokenEntryId: null, message: null }
  }

  const hashRows: AuditHashRow[] = rows.map(toAuditHashRow)

  const ordered = [...hashRows].sort((a, b) => {
    const at = a.createdAt.localeCompare(b.createdAt)
    return at !== 0 ? at : a.id.localeCompare(b.id)
  })

  const oldest = ordered[0]!
  const predecessor = await fetchPredecessor(db, rows.find(r => r.id === oldest.id)!)
  const verifyRows = predecessor ? [predecessor, ...ordered] : ordered

  return verifyAuditChainRows(verifyRows)
}

function categoryConditions(category: AuditListQuery['category']) {
  if (category === 'all') return []

  switch (category) {
    case 'settings':
      return [or(
        ilike(auditLogs.entityType, 'setup'),
        ilike(auditLogs.entityType, 'flags'),
        ilike(auditLogs.action, 'setup.%'),
        ilike(auditLogs.action, 'flags.%'),
      )]
    case 'users':
      return [or(
        ilike(auditLogs.entityType, 'user'),
        ilike(auditLogs.entityType, 'auth'),
        ilike(auditLogs.action, 'users.%'),
        ilike(auditLogs.action, 'auth.%'),
        ilike(auditLogs.action, 'user.%'),
      )]
    case 'backups':
      return [or(
        ilike(auditLogs.action, 'backup.%'),
        ilike(auditLogs.entityType, 'backup'),
      )]
    case 'security':
      return [or(
        ilike(auditLogs.action, 'auth.login%'),
        ilike(auditLogs.action, 'auth.signup%'),
        ilike(auditLogs.action, 'auth.verify%'),
        ilike(auditLogs.action, 'portal.login%'),
        eq(auditLogs.riskLevel, 'high'),
        eq(auditLogs.riskLevel, 'sensitive'),
      )]
    default:
      return []
  }
}

function buildConditions(filter: ListAuditLogsFilter) {
  const conditions = categoryConditions(filter.category ?? 'all')

  if (filter.entityType) {
    conditions.push(eq(auditLogs.entityType, filter.entityType))
  }

  if (filter.action) {
    conditions.push(eq(auditLogs.action, filter.action))
  }

  if (filter.actorUserId) {
    conditions.push(eq(auditLogs.actorUserId, filter.actorUserId))
  }

  if (filter.dateFrom) {
    conditions.push(gte(auditLogs.createdAt, new Date(`${filter.dateFrom}T00:00:00.000Z`)))
  }

  if (filter.dateTo) {
    conditions.push(lte(auditLogs.createdAt, new Date(`${filter.dateTo}T23:59:59.999Z`)))
  }

  if (filter.q) {
    const term = `%${filter.q}%`
    conditions.push(or(
      ilike(auditLogs.action, term),
      ilike(auditLogs.entityType, term),
      ilike(auditLogs.entityId, term),
      ilike(auditLogs.actorName, term),
      ilike(auditLogs.actorEmail, term),
      ilike(auditLogs.requestId, term),
      sql`${auditLogs.afterData}::text ilike ${term}`,
      sql`${auditLogs.beforeData}::text ilike ${term}`,
    ))
  }

  return conditions
}

export async function listAuditLogs(db: Db, filter: ListAuditLogsFilter) {
  const conditions = buildConditions(filter)
  const where = conditions.length ? and(...conditions) : undefined

  const rows = await db.select({
    id: auditLogs.id,
    entityType: auditLogs.entityType,
    entityId: auditLogs.entityId,
    action: auditLogs.action,
    actorUserId: auditLogs.actorUserId,
    actorName: auditLogs.actorName,
    actorEmail: auditLogs.actorEmail,
    actorAccountType: auditLogs.actorAccountType,
    changedFields: auditLogs.changedFields,
    afterData: auditLogs.afterData,
    beforeData: auditLogs.beforeData,
    riskLevel: auditLogs.riskLevel,
    ipAddress: auditLogs.ipAddress,
    userAgent: auditLogs.userAgent,
    permissionKey: auditLogs.permissionKey,
    requestId: auditLogs.requestId,
    previousHash: auditLogs.previousHash,
    entryHash: auditLogs.entryHash,
    createdAt: auditLogs.createdAt,
  })
    .from(auditLogs)
    .where(where)
    .orderBy(desc(auditLogs.createdAt))
    .limit(filter.pageSize)
    .offset((filter.page - 1) * filter.pageSize)

  const items = rows as AuditLogListItem[]
  const chainVerification = await verifyListedAuditRows(db, items)

  const [total] = await db.select({ value: count() })
    .from(auditLogs)
    .where(where)

  return {
    items,
    total: Number(total?.value ?? 0),
    page: filter.page,
    pageSize: filter.pageSize,
    chainVerification,
  }
}

export async function listAuditLogFacets(db: Db) {
  const entityRows = await db.selectDistinct({ entityType: auditLogs.entityType })
    .from(auditLogs)
    .orderBy(auditLogs.entityType)

  const actionRows = await db.selectDistinct({ action: auditLogs.action })
    .from(auditLogs)
    .orderBy(auditLogs.action)
    .limit(200)

  return {
    entityTypes: entityRows.map(r => r.entityType).filter(Boolean),
    actions: actionRows.map(r => r.action).filter(Boolean),
  }
}
