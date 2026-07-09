import { and, desc, eq, gte, sql } from 'drizzle-orm'
import type { Db } from '../db/client'
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
  ipAddress: string | null
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
  ipAddress?: string | null
}

const FAILED_LOGIN_BURST_THRESHOLD = 5
const FAILED_LOGIN_BURST_WINDOW_MS = 15 * 60 * 1000
const OFF_HOURS_START = 22 // 10 PM UTC
const OFF_HOURS_END = 6 // 6 AM UTC

function mapAlert(row: typeof suspiciousActivityAlerts.$inferSelect): SuspiciousActivityAlertView {
  return {
    id: row.id,
    ruleKey: row.ruleKey,
    severity: row.severity as SuspiciousAlertSeverity,
    title: row.title,
    description: row.description,
    metadata: (row.metadata ?? {}) as Record<string, unknown>,
    actorUserId: row.actorUserId,
    ipAddress: row.ipAddress,
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
  const [row] = await db.insert(suspiciousActivityAlerts).values({
    ruleKey: input.ruleKey,
    severity: input.severity ?? 'medium',
    title: input.title,
    description: input.description,
    metadata: input.metadata ?? {},
    actorUserId: input.actorUserId ?? null,
    ipAddress: input.ipAddress ?? null,
  }).returning()

  return mapAlert(row!)
}

export async function listSuspiciousActivityAlerts(
  db: Db,
  opts: { status?: SuspiciousAlertStatus, limit?: number } = {},
): Promise<SuspiciousActivityAlertView[]> {
  const limit = opts.limit ?? 50
  const conditions = opts.status ? eq(suspiciousActivityAlerts.status, opts.status) : undefined

  const rows = await db.select()
    .from(suspiciousActivityAlerts)
    .where(conditions)
    .orderBy(desc(suspiciousActivityAlerts.createdAt))
    .limit(limit)

  return rows.map(mapAlert)
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

    await createSuspiciousActivityAlert(db, {
      ruleKey: 'auth.failed_login_burst',
      severity: 'high',
      title: 'Repeated failed login attempts',
      description: `${row.attempts} failed login attempts from ${row.key} in the last 15 minutes.`,
      metadata: { dedupeKey, attempts: row.attempts, key: row.key },
      ipAddress: row.key.startsWith('ip:') ? row.key.slice(3) : null,
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

    await createSuspiciousActivityAlert(db, {
      ruleKey: 'auth.off_hours_admin',
      severity: 'medium',
      title: 'Off-hours Super Admin action',
      description: `Super Admin ${row.actorEmail ?? row.actorUserId ?? 'unknown'} performed "${row.action}" outside business hours (UTC).`,
      metadata: { dedupeKey, action: row.action, auditLogId: row.id },
      actorUserId: row.actorUserId,
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

    await createSuspiciousActivityAlert(db, {
      ruleKey: 'audit.high_risk_burst',
      severity: 'high',
      title: 'Burst of high-risk actions',
      description: `${row.count} high-risk audit events by ${row.actorEmail ?? row.actorUserId} in 5 minutes.`,
      metadata: { dedupeKey, count: row.count },
      actorUserId: row.actorUserId,
    })
    created++
  }
  return created
}

export async function recordBackupRestoreAlert(
  db: Db,
  actor: { id: string, email?: string | null },
  backupRunId: string,
  reason: string,
): Promise<SuspiciousActivityAlertView> {
  return createSuspiciousActivityAlert(db, {
    ruleKey: 'backup.restore_attempt',
    severity: 'high',
    title: 'Database restore initiated',
    description: `Super Admin ${actor.email ?? actor.id} initiated a database restore from backup ${backupRunId}.`,
    metadata: { backupRunId, reason, dedupeKey: backupRunId },
    actorUserId: actor.id,
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

  await createSuspiciousActivityAlert(db, {
    ruleKey: 'auth.failed_login_burst',
    severity: 'high',
    title: 'Repeated failed login attempts',
    description: `${attempts} failed login attempts from ${ipAddress ?? 'unknown IP'} in the last 15 minutes.`,
    metadata: { dedupeKey: key, attempts, key },
    ipAddress,
  })
}
