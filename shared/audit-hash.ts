import { createHash } from 'node:crypto'

/** Genesis anchor for the append-only audit hash chain (SPEC §11, P3-07). */
export const AUDIT_GENESIS_HASH = createHash('sha256').update('dorinc-audit-genesis-v1').digest('hex')

/** Advisory lock key — serializes chain writes and one-time backfill (P3-07). */
export const AUDIT_CHAIN_LOCK_KEY = 75834023

export interface AuditHashPayload {
  id: string
  entityType: string
  entityId: string | null
  action: string
  beforeData: unknown
  afterData: unknown
  changedFields: unknown
  actorUserId: string | null
  actorName: string | null
  actorEmail: string | null
  actorAccountType: string | null
  permissionKey: string | null
  riskLevel: string
  ipAddress: string | null
  userAgent: string | null
  requestId: string | null
  createdAt: string
}

export type AuditHashRow = AuditHashPayload & {
  previousHash: string | null
  entryHash: string | null
}

export function auditCreatedAtIso(value: Date | string): string {
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString()
}

function stableJsonValue(value: unknown): unknown {
  if (value === null || value === undefined) return null
  if (Array.isArray(value)) return value.map(stableJsonValue)
  if (typeof value === 'object') {
    const record = value as Record<string, unknown>
    return Object.keys(record).sort().reduce<Record<string, unknown>>((acc, key) => {
      acc[key] = stableJsonValue(record[key])
      return acc
    }, {})
  }
  return value
}

export function stableJsonStringify(value: unknown): string {
  return JSON.stringify(stableJsonValue(value))
}

export function buildAuditHashPayload(row: Omit<AuditHashPayload, 'createdAt'> & { createdAt: Date | string }): AuditHashPayload {
  return {
    id: row.id,
    entityType: row.entityType,
    entityId: row.entityId ?? null,
    action: row.action,
    beforeData: row.beforeData ?? null,
    afterData: row.afterData ?? null,
    changedFields: row.changedFields ?? null,
    actorUserId: row.actorUserId ?? null,
    actorName: row.actorName ?? null,
    actorEmail: row.actorEmail ?? null,
    actorAccountType: row.actorAccountType ?? null,
    permissionKey: row.permissionKey ?? null,
    riskLevel: row.riskLevel,
    ipAddress: row.ipAddress ?? null,
    userAgent: row.userAgent ?? null,
    requestId: row.requestId ?? null,
    createdAt: auditCreatedAtIso(row.createdAt),
  }
}

export function canonicalAuditPayloadJson(payload: AuditHashPayload): string {
  return stableJsonStringify({
    id: payload.id,
    entityType: payload.entityType,
    entityId: payload.entityId,
    action: payload.action,
    beforeData: payload.beforeData,
    afterData: payload.afterData,
    changedFields: payload.changedFields,
    actorUserId: payload.actorUserId,
    actorName: payload.actorName,
    actorEmail: payload.actorEmail,
    actorAccountType: payload.actorAccountType,
    permissionKey: payload.permissionKey,
    riskLevel: payload.riskLevel,
    ipAddress: payload.ipAddress,
    userAgent: payload.userAgent,
    requestId: payload.requestId,
    createdAt: payload.createdAt,
  })
}

export function computeAuditEntryHash(previousHash: string, payload: AuditHashPayload): string {
  return createHash('sha256')
    .update(`${previousHash}|${canonicalAuditPayloadJson(payload)}`)
    .digest('hex')
}

export function isLegacyAuditHashRow(row: Pick<AuditHashRow, 'previousHash' | 'entryHash'>): boolean {
  return !row.previousHash || !row.entryHash
}

export function verifyAuditEntryHash(row: AuditHashRow): boolean {
  if (isLegacyAuditHashRow(row)) return true

  const payload = buildAuditHashPayload(row)
  const expected = computeAuditEntryHash(row.previousHash!, payload)
  return expected === row.entryHash
}

export type AuditChainVerificationStatus = 'valid' | 'broken' | 'legacy' | 'partial'

export interface AuditChainVerification {
  status: AuditChainVerificationStatus
  checked: number
  brokenEntryId: string | null
  message: string | null
}

function compareAuditRows(a: AuditHashRow, b: AuditHashRow): number {
  const at = auditCreatedAtIso(a.createdAt).localeCompare(auditCreatedAtIso(b.createdAt))
  if (at !== 0) return at
  return a.id.localeCompare(b.id)
}

export function verifyAuditChainRows(rows: AuditHashRow[]): AuditChainVerification {
  if (!rows.length) {
    return { status: 'valid', checked: 0, brokenEntryId: null, message: null }
  }

  const ordered = [...rows].sort(compareAuditRows)
  const legacyCount = ordered.filter(isLegacyAuditHashRow).length

  if (legacyCount === ordered.length) {
    return {
      status: 'legacy',
      checked: ordered.length,
      brokenEntryId: null,
      message: 'Rows predate hash chain; integrity not verifiable.',
    }
  }

  if (legacyCount > 0) {
    return {
      status: 'partial',
      checked: ordered.length,
      brokenEntryId: null,
      message: 'Mixed legacy and chained rows; full chain continuity not verified.',
    }
  }

  for (const row of ordered) {
    if (!verifyAuditEntryHash(row)) {
      return {
        status: 'broken',
        checked: ordered.length,
        brokenEntryId: row.id,
        message: 'Entry hash mismatch — possible tampering.',
      }
    }
  }

  for (let i = 1; i < ordered.length; i++) {
    const prev = ordered[i - 1]!
    const current = ordered[i]!
    if (current.previousHash !== prev.entryHash) {
      return {
        status: 'broken',
        checked: ordered.length,
        brokenEntryId: current.id,
        message: 'Previous-hash link broken — chain continuity failed.',
      }
    }
  }

  return { status: 'valid', checked: ordered.length, brokenEntryId: null, message: null }
}
