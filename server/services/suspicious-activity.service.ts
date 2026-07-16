import { and, desc, eq, gte, sql } from 'drizzle-orm'
import type { Db } from '../db/client'
import { users } from '../db/schema/auth'
import { auditLogs } from '../db/schema/audit'
import { rateLimitEvents } from '../db/schema/rate-limits'
import {
  suspiciousActivityAlerts,
  type SuspiciousAlertSeverity,
  type SuspiciousAlertStatus,
} from '../db/schema/security'

export interface SuspiciousActivityAlertView {
  id: string
  ruleKey: string
  severity: SuspiciousAlertSeverity
  title: string
  description: string
  metadata: Record<string, unknown>
  actorUserId: string | null
  actorName: string | null
  actorEmail: string | null
  ipAddress: string | null
  ipAddresses: string[]
  status: SuspiciousAlertStatus
  dismissedAt: Date | null
  dismissedBy: string | null
  createdAt: Date
}

export interface CreateSuspiciousAlertInput {
  ruleKey: string
  severity?: SuspiciousAlertSeverity
  title: string
  description: string
  metadata?: Record<string, unknown>
  actorUserId?: string | null
  actorName?: string | null
  actorEmail?: string | null
  ipAddress?: string | null
  ipAddresses?: string[]
}

const FAILED_LOGIN_BURST_THRESHOLD = 5
const FAILED_LOGIN_BURST_WINDOW_MS = 15 * 60 * 1000
const OFF_HOURS_START = 22 // 10 PM UTC
const OFF_HOURS_END = 6 // 6 AM UTC

function normalizeIp(value: string | null | undefined): string | null {
  if (!value) return null
  const trimmed = String(value).trim()
  return trimmed || null
}

export function collectUniqueIps(values: Array<string | null | undefined>): string[] {
  const seen = new Set<string>()
  const out: string[] = []
  for (const value of values) {
    const ip = normalizeIp(value)
    if (!ip || seen.has(ip)) continue
    seen.add(ip)
    out.push(ip)
  }
  return out
}

function ipFromRateLimitKey(key: string): string | null {
  if (key.startsWith('ip:')) return normalizeIp(key.slice(3))
  return null
}

function buildAlertMetadata(
  input: CreateSuspiciousAlertInput,
): { metadata: Record<string, unknown>, ipAddress: string | null } {
  const metadata = { ...(input.metadata ?? {}) }
  const ipAddresses = collectUniqueIps([
    ...(input.ipAddresses ?? []),
    input.ipAddress,
    ...(Array.isArray(metadata.ipAddresses) ? metadata.ipAddresses as string[] : []),
  ])

  if (input.actorEmail) metadata.actorEmail = input.actorEmail
  if (input.actorName) metadata.actorName = input.actorName
  if (ipAddresses.length) metadata.ipAddresses = ipAddresses

  return {
    metadata,
    ipAddress: ipAddresses[0] ?? normalizeIp(input.ipAddress),
  }
}

function mapAlert(
  row: typeof suspiciousActivityAlerts.$inferSelect,
  actor?: { name: string | null, email: string | null } | null,
): SuspiciousActivityAlertView {
  const metadata = (row.metadata ?? {}) as Record<string, unknown>
  const ipAddresses = collectUniqueIps([
    ...(Array.isArray(metadata.ipAddresses) ? metadata.ipAddresses as string[] : []),
    row.ipAddress ? String(row.ipAddress) : null,
  ])

  return {
    id: row.id,
    ruleKey: row.ruleKey,
    severity: row.severity as SuspiciousAlertSeverity,
    title: row.title,
    description: row.description,
    metadata,
    actorUserId: row.actorUserId,
    actorName: actor?.name ?? (typeof metadata.actorName === 'string' ? metadata.actorName : null),
    actorEmail: actor?.email ?? (typeof metadata.actorEmail === 'string' ? metadata.actorEmail : null),
    ipAddress: ipAddresses[0] ?? null,
    ipAddresses,
    status: row.status as SuspiciousAlertStatus,
    dismissedAt: row.dismissedAt,
    dismissedBy: row.dismissedBy,
    createdAt: row.createdAt,
  }
}

export async function createSuspiciousActivityAlert(
  db: Db,
  input: CreateSuspiciousAlertInput,
): Promise<SuspiciousActivityAlertView> {
  const { metadata, ipAddress } = buildAlertMetadata(input)
  const [row] = await db.insert(suspiciousActivityAlerts).values({
    ruleKey: input.ruleKey,
    severity: input.severity ?? 'medium',
    title: input.title,
    description: input.description,
    metadata,
    actorUserId: input.actorUserId ?? null,
    ipAddress,
  }).returning()

  return mapAlert(row!, {
    name: input.actorName ?? null,
    email: input.actorEmail ?? null,
  })
}

export async function listSuspiciousActivityAlerts(
  db: Db,
  opts: { status?: SuspiciousAlertStatus, limit?: number } = {},
): Promise<SuspiciousActivityAlertView[]> {
  const limit = opts.limit ?? 50
  const conditions = opts.status ? eq(suspiciousActivityAlerts.status, opts.status) : undefined

  const rows = await db.select({
    alert: suspiciousActivityAlerts,
    actorName: users.name,
    actorEmail: users.email,
  })
    .from(suspiciousActivityAlerts)
    .leftJoin(users, eq(users.id, suspiciousActivityAlerts.actorUserId))
    .where(conditions)
    .orderBy(desc(suspiciousActivityAlerts.createdAt))
    .limit(limit)

  return rows.map(row => mapAlert(row.alert, { name: row.actorName, email: row.actorEmail }))
}

export async function dismissSuspiciousActivityAlert(
  db: Db,
  alertId: string,
  actorId: string,
): Promise<SuspiciousActivityAlertView | null> {
  const [row] = await db.update(suspiciousActivityAlerts)
    .set({
      status: 'dismissed',
      dismissedAt: new Date(),
      dismissedBy: actorId,
    })
    .where(and(
      eq(suspiciousActivityAlerts.id, alertId),
      eq(suspiciousActivityAlerts.status, 'open'),
    ))
    .returning()

  return row ? mapAlert(row) : null
}

/** Scan recent audit + rate-limit events for basic suspicious patterns (P3-10). */
export async function scanSuspiciousActivity(db: Db): Promise<number> {
  let created = 0
  created += await scanFailedLoginBursts(db)
  created += await scanOffHoursAdminActions(db)
  created += await scanHighRiskAuditBurst(db)
  return created
}

async function hasOpenAlert(db: Db, ruleKey: string, dedupeKey: string, windowMs: number): Promise<boolean> {
  const since = new Date(Date.now() - windowMs)
  const [row] = await db.select({ id: suspiciousActivityAlerts.id })
    .from(suspiciousActivityAlerts)
    .where(and(
      eq(suspiciousActivityAlerts.ruleKey, ruleKey),
      eq(suspiciousActivityAlerts.status, 'open'),
      gte(suspiciousActivityAlerts.createdAt, since),
      sql`${suspiciousActivityAlerts.metadata}->>'dedupeKey' = ${dedupeKey}`,
    ))
    .limit(1)
  return Boolean(row)
}

async function scanFailedLoginBursts(db: Db): Promise<number> {
  const since = new Date(Date.now() - FAILED_LOGIN_BURST_WINDOW_MS)
  const rows = await db.select({
    key: rateLimitEvents.key,
    attempts: sql<number>`count(*)::int`,
  })
    .from(rateLimitEvents)
    .where(and(
      eq(rateLimitEvents.scope, 'login'),
      gte(rateLimitEvents.createdAt, since),
    ))
    .groupBy(rateLimitEvents.key)
    .having(sql`count(*) >= ${FAILED_LOGIN_BURST_THRESHOLD}`)

  let created = 0
  for (const row of rows) {
    const dedupeKey = row.key
    if (await hasOpenAlert(db, 'auth.failed_login_burst', dedupeKey, FAILED_LOGIN_BURST_WINDOW_MS)) continue

    const ip = ipFromRateLimitKey(row.key)
    await createSuspiciousActivityAlert(db, {
      ruleKey: 'auth.failed_login_burst',
      severity: 'high',
      title: 'Repeated failed login attempts',
      description: `${row.attempts} failed login attempts from ${ip ?? row.key} in the last 15 minutes.`,
      metadata: { dedupeKey, attempts: row.attempts, key: row.key },
      ipAddress: ip,
      ipAddresses: ip ? [ip] : [],
    })
    created++
  }
  return created
}

async function scanOffHoursAdminActions(db: Db): Promise<number> {
  const since = new Date(Date.now() - 60 * 60 * 1000)
  const rows = await db.select({
    id: auditLogs.id,
    action: auditLogs.action,
    actorUserId: auditLogs.actorUserId,
    actorEmail: auditLogs.actorEmail,
    ipAddress: auditLogs.ipAddress,
    createdAt: auditLogs.createdAt,
  })
    .from(auditLogs)
    .where(and(
      gte(auditLogs.createdAt, since),
      eq(auditLogs.riskLevel, 'high'),
      sql`${auditLogs.actorAccountType} = 'super_admin'`,
    ))
    .limit(20)

  let created = 0
  for (const row of rows) {
    const hour = row.createdAt.getUTCHours()
    if (hour >= OFF_HOURS_END && hour < OFF_HOURS_START) continue

    const dedupeKey = `${row.action}:${row.id}`
    if (await hasOpenAlert(db, 'auth.off_hours_admin', dedupeKey, 60 * 60 * 1000)) continue

    const ip = row.ipAddress ? String(row.ipAddress) : null
    await createSuspiciousActivityAlert(db, {
      ruleKey: 'auth.off_hours_admin',
      severity: 'medium',
      title: 'Off-hours Super Admin action',
      description: `Super Admin ${row.actorEmail ?? row.actorUserId ?? 'unknown'} performed "${row.action}" outside business hours (UTC).`,
      metadata: { dedupeKey, action: row.action, auditLogId: row.id },
      actorUserId: row.actorUserId,
      actorEmail: row.actorEmail ?? undefined,
      ipAddress: ip,
      ipAddresses: ip ? [ip] : [],
    })
    created++
  }
  return created
}

async function scanHighRiskAuditBurst(db: Db): Promise<number> {
  const since = new Date(Date.now() - 5 * 60 * 1000)
  const rows = await db.select({
    actorUserId: auditLogs.actorUserId,
    actorEmail: auditLogs.actorEmail,
    count: sql<number>`count(*)::int`,
  })
    .from(auditLogs)
    .where(and(
      gte(auditLogs.createdAt, since),
      eq(auditLogs.riskLevel, 'high'),
    ))
    .groupBy(auditLogs.actorUserId, auditLogs.actorEmail)
    .having(sql`count(*) >= 5`)

  let created = 0
  for (const row of rows) {
    if (!row.actorUserId) continue
    const dedupeKey = row.actorUserId
    if (await hasOpenAlert(db, 'audit.high_risk_burst', dedupeKey, 5 * 60 * 1000)) continue

    const ipRows = await db.select({ ipAddress: auditLogs.ipAddress })
      .from(auditLogs)
      .where(and(
        gte(auditLogs.createdAt, since),
        eq(auditLogs.riskLevel, 'high'),
        eq(auditLogs.actorUserId, row.actorUserId),
      ))

    const ipAddresses = collectUniqueIps(ipRows.map(r => (r.ipAddress ? String(r.ipAddress) : null)))

    await createSuspiciousActivityAlert(db, {
      ruleKey: 'audit.high_risk_burst',
      severity: 'high',
      title: 'Burst of high-risk actions',
      description: `${row.count} high-risk audit events by ${row.actorEmail ?? row.actorUserId} in 5 minutes.`,
      metadata: { dedupeKey, count: row.count },
      actorUserId: row.actorUserId,
      actorEmail: row.actorEmail ?? undefined,
      ipAddress: ipAddresses[0] ?? null,
      ipAddresses,
    })
    created++
  }
  return created
}

export async function recordBackupRestoreAlert(
  db: Db,
  actor: { id: string, email?: string | null, name?: string | null },
  backupRunId: string,
  reason: string,
  ipAddress?: string | null,
): Promise<SuspiciousActivityAlertView> {
  const ip = normalizeIp(ipAddress)
  return createSuspiciousActivityAlert(db, {
    ruleKey: 'backup.restore_attempt',
    severity: 'high',
    title: 'Database restore initiated',
    description: `Super Admin ${actor.email ?? actor.id} initiated a database restore from backup ${backupRunId}. Reason: ${reason}`,
    metadata: { backupRunId, reason, dedupeKey: backupRunId },
    actorUserId: actor.id,
    actorEmail: actor.email ?? undefined,
    actorName: actor.name ?? undefined,
    ipAddress: ip,
    ipAddresses: ip ? [ip] : [],
  })
}

export async function recordFailedLoginAlert(
  db: Db,
  ipAddress: string | null,
): Promise<void> {
  const key = ipAddress ? `ip:${ipAddress}` : 'ip:unknown'
  const since = new Date(Date.now() - FAILED_LOGIN_BURST_WINDOW_MS)
  const [row] = await db.select({ value: sql<number>`count(*)::int` })
    .from(rateLimitEvents)
    .where(and(
      eq(rateLimitEvents.scope, 'login'),
      eq(rateLimitEvents.key, key),
      gte(rateLimitEvents.createdAt, since),
    ))

  const attempts = Number(row?.value ?? 0)
  if (attempts < FAILED_LOGIN_BURST_THRESHOLD) return
  if (await hasOpenAlert(db, 'auth.failed_login_burst', key, FAILED_LOGIN_BURST_WINDOW_MS)) return

  const ip = normalizeIp(ipAddress)
  await createSuspiciousActivityAlert(db, {
    ruleKey: 'auth.failed_login_burst',
    severity: 'high',
    title: 'Repeated failed login attempts',
    description: `${attempts} failed login attempts from ${ip ?? 'unknown IP'} in the last 15 minutes.`,
    metadata: { dedupeKey: key, attempts, key },
    ipAddress: ip,
    ipAddresses: ip ? [ip] : [],
  })
}
