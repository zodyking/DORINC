import { and, desc, eq, gte, isNotNull, lt, or, sql, type SQL } from 'drizzle-orm'
import type { Db } from '../../db/client'
import { accessEvents } from '../../db/schema/security-access'
import type {
  GeoSource,
  SecurityBlockReason,
  SecurityEventOutcome,
  SecurityEventStage,
  SecurityEventType,
} from '../../../shared/validators/security-access'

export interface RecordAccessEventInput {
  eventType: SecurityEventType
  stage?: SecurityEventStage
  outcome?: SecurityEventOutcome
  blockReason?: SecurityBlockReason | null
  enforced?: boolean

  ipAddress?: string | null
  matchedIpRule?: string | null
  matchedBanId?: string | null
  matchedGeofenceId?: string | null
  matchedGeofenceName?: string | null

  userId?: string | null
  userName?: string | null
  userEmail?: string | null
  sessionId?: string | null
  path?: string | null
  userAgent?: string | null
  requestId?: string | null

  latitude?: number | null
  longitude?: number | null
  geoSource?: GeoSource
  accuracyM?: number | null
  ipLatitude?: number | null
  ipLongitude?: number | null
  deviceLatitude?: number | null
  deviceLongitude?: number | null

  locationLabel?: string | null
  city?: string | null
  region?: string | null
  postalCode?: string | null
  country?: string | null
  timezone?: string | null

  attemptedIdentifier?: string | null
  attemptedPortal?: string | null
  passwordFingerprint?: string | null
  passwordLength?: number | null
  accountExists?: boolean | null
  failureReason?: string | null
}

export interface AccessEventView {
  id: string
  eventType: SecurityEventType
  stage: SecurityEventStage
  outcome: SecurityEventOutcome
  blockReason: SecurityBlockReason | null
  enforced: boolean
  ipAddress: string | null
  matchedIpRule: string | null
  matchedBanId: string | null
  matchedGeofenceId: string | null
  matchedGeofenceName: string | null
  userId: string | null
  userName: string | null
  userEmail: string | null
  path: string | null
  userAgent: string | null
  latitude: number | null
  longitude: number | null
  geoSource: GeoSource
  accuracyM: number | null
  locationLabel: string | null
  city: string | null
  region: string | null
  country: string | null
  timezone: string | null
  attemptedIdentifier: string | null
  attemptedPortal: string | null
  passwordFingerprint: string | null
  passwordLength: number | null
  accountExists: boolean | null
  failureReason: string | null
  createdAt: string
}

type AccessEventRow = typeof accessEvents.$inferSelect

function toView(row: AccessEventRow): AccessEventView {
  return {
    id: row.id,
    eventType: row.eventType,
    stage: row.stage,
    outcome: row.outcome,
    blockReason: row.blockReason,
    enforced: row.enforced,
    ipAddress: row.ipAddress,
    matchedIpRule: row.matchedIpRule,
    matchedBanId: row.matchedBanId,
    matchedGeofenceId: row.matchedGeofenceId,
    matchedGeofenceName: row.matchedGeofenceName,
    userId: row.userId,
    userName: row.userName,
    userEmail: row.userEmail,
    path: row.path,
    userAgent: row.userAgent,
    latitude: row.latitude,
    longitude: row.longitude,
    geoSource: row.geoSource,
    accuracyM: row.accuracyM,
    locationLabel: row.locationLabel,
    city: row.city,
    region: row.region,
    country: row.country,
    timezone: row.timezone,
    attemptedIdentifier: row.attemptedIdentifier,
    attemptedPortal: row.attemptedPortal,
    passwordFingerprint: row.passwordFingerprint,
    passwordLength: row.passwordLength,
    accountExists: row.accountExists,
    failureReason: row.failureReason,
    createdAt: row.createdAt.toISOString(),
  }
}

export async function recordAccessEvent(db: Db, input: RecordAccessEventInput): Promise<string | null> {
  const [row] = await db.insert(accessEvents).values({
    eventType: input.eventType,
    stage: input.stage ?? 'page_load',
    outcome: input.outcome ?? 'allowed',
    blockReason: input.blockReason ?? null,
    enforced: input.enforced ?? false,

    ipAddress: input.ipAddress ?? null,
    matchedIpRule: input.matchedIpRule ?? null,
    matchedBanId: input.matchedBanId ?? null,
    matchedGeofenceId: input.matchedGeofenceId ?? null,
    matchedGeofenceName: input.matchedGeofenceName ?? null,

    userId: input.userId ?? null,
    userName: input.userName ?? null,
    userEmail: input.userEmail ?? null,
    sessionId: input.sessionId ?? null,
    path: input.path ? input.path.slice(0, 500) : null,
    userAgent: input.userAgent ? input.userAgent.slice(0, 500) : null,
    requestId: input.requestId ?? null,

    latitude: input.latitude ?? null,
    longitude: input.longitude ?? null,
    geoSource: input.geoSource ?? 'none',
    accuracyM: input.accuracyM ?? null,
    ipLatitude: input.ipLatitude ?? null,
    ipLongitude: input.ipLongitude ?? null,
    deviceLatitude: input.deviceLatitude ?? null,
    deviceLongitude: input.deviceLongitude ?? null,

    locationLabel: input.locationLabel ?? null,
    city: input.city ?? null,
    region: input.region ?? null,
    postalCode: input.postalCode ?? null,
    country: input.country ?? null,
    timezone: input.timezone ?? null,

    attemptedIdentifier: input.attemptedIdentifier ?? null,
    attemptedPortal: input.attemptedPortal ?? null,
    passwordFingerprint: input.passwordFingerprint ?? null,
    passwordLength: input.passwordLength ?? null,
    accountExists: input.accountExists ?? null,
    failureReason: input.failureReason ?? null,
  }).returning({ id: accessEvents.id })

  return row?.id ?? null
}

export interface ListAccessEventsFilter {
  eventType?: SecurityEventType
  outcome?: SecurityEventOutcome
  stage?: SecurityEventStage
  mappedOnly?: boolean
  blockedOnly?: boolean
  search?: string
  sinceHours?: number
  limit?: number
  offset?: number
}

function buildEventConditions(filter: ListAccessEventsFilter): SQL | undefined {
  const conditions: SQL[] = []

  if (filter.eventType) conditions.push(eq(accessEvents.eventType, filter.eventType))
  if (filter.outcome) conditions.push(eq(accessEvents.outcome, filter.outcome))
  if (filter.stage) conditions.push(eq(accessEvents.stage, filter.stage))
  if (filter.mappedOnly) {
    conditions.push(and(isNotNull(accessEvents.latitude), isNotNull(accessEvents.longitude))!)
  }
  if (filter.blockedOnly) {
    conditions.push(or(
      eq(accessEvents.outcome, 'blocked'),
      eq(accessEvents.outcome, 'would_block'),
      eq(accessEvents.outcome, 'login_failed'),
    )!)
  }
  if (filter.sinceHours) {
    conditions.push(gte(accessEvents.createdAt, new Date(Date.now() - filter.sinceHours * 3600_000)))
  }
  if (filter.search) {
    const term = `%${filter.search.toLowerCase()}%`
    conditions.push(sql`(
      lower(coalesce(${accessEvents.attemptedIdentifier}, '')) LIKE ${term}
      OR lower(coalesce(${accessEvents.userEmail}, '')) LIKE ${term}
      OR lower(coalesce(${accessEvents.userName}, '')) LIKE ${term}
      OR lower(coalesce(${accessEvents.locationLabel}, '')) LIKE ${term}
      OR lower(coalesce(${accessEvents.country}, '')) LIKE ${term}
      OR lower(coalesce(${accessEvents.path}, '')) LIKE ${term}
      OR host(${accessEvents.ipAddress}) LIKE ${term}
    )`)
  }

  return conditions.length ? and(...conditions) : undefined
}

export async function listAccessEvents(
  db: Db,
  filter: ListAccessEventsFilter = {},
): Promise<{ items: AccessEventView[], total: number }> {
  const limit = Math.min(Math.max(filter.limit ?? 500, 1), 5000)
  const offset = Math.max(filter.offset ?? 0, 0)
  const where = buildEventConditions(filter)

  const [rows, [count]] = await Promise.all([
    db.select().from(accessEvents).where(where)
      .orderBy(desc(accessEvents.createdAt)).limit(limit).offset(offset),
    db.select({ value: sql<number>`count(*)::int` }).from(accessEvents).where(where),
  ])

  return { items: rows.map(toView), total: Number(count?.value ?? 0) }
}

export interface ThreatGroupView {
  /** Stable key for the UI, derived from the grouped columns. */
  key: string
  ipAddress: string | null
  attemptedIdentifier: string | null
  attempts: number
  failedAttempts: number
  blockedAttempts: number
  successfulLogins: number
  /** How many distinct passwords were tried — high means credential spraying. */
  distinctPasswords: number
  /** True when every attempt reused one password, typical of a stuffing list. */
  repeatedSamePassword: boolean
  accountExists: boolean | null
  portals: string[]
  failureReasons: string[]
  locationLabel: string | null
  country: string | null
  latitude: number | null
  longitude: number | null
  userAgent: string | null
  firstSeenAt: string
  lastSeenAt: string
  alreadyBanned: boolean
}

/**
 * Group repeated sign-in attempts by source IP and the username tried. This is
 * the view that answers "who is hammering the login form, and with what?" —
 * each row carries the credentials used and a one-click path to a ban.
 */
export async function listThreatGroups(
  db: Db,
  opts: { sinceHours?: number, minAttempts?: number, limit?: number } = {},
): Promise<ThreatGroupView[]> {
  const since = new Date(Date.now() - (opts.sinceHours ?? 168) * 3600_000)
  const minAttempts = Math.max(opts.minAttempts ?? 2, 1)
  const limit = Math.min(Math.max(opts.limit ?? 100, 1), 500)

  const rows = await db.execute<{
    ip_text: string | null
    attempted_identifier: string | null
    attempts: number
    failed_attempts: number
    blocked_attempts: number
    successful_logins: number
    distinct_passwords: number
    account_exists: boolean | null
    portals: string[] | null
    failure_reasons: string[] | null
    location_label: string | null
    country: string | null
    latitude: number | null
    longitude: number | null
    user_agent: string | null
    first_seen_at: Date
    last_seen_at: Date
    already_banned: boolean
  }>(sql`
    SELECT
      host(e.ip_address) AS ip_text,
      e.attempted_identifier,
      count(*)::int AS attempts,
      count(*) FILTER (WHERE e.outcome = 'login_failed')::int AS failed_attempts,
      count(*) FILTER (WHERE e.outcome IN ('blocked', 'would_block'))::int AS blocked_attempts,
      count(*) FILTER (WHERE e.outcome = 'login_success')::int AS successful_logins,
      count(DISTINCT e.password_fingerprint)::int AS distinct_passwords,
      bool_or(e.account_exists) AS account_exists,
      array_remove(array_agg(DISTINCT e.attempted_portal), NULL) AS portals,
      array_remove(array_agg(DISTINCT e.failure_reason), NULL) AS failure_reasons,
      (array_remove(array_agg(e.location_label ORDER BY e.created_at DESC), NULL))[1] AS location_label,
      (array_remove(array_agg(e.country ORDER BY e.created_at DESC), NULL))[1] AS country,
      (array_remove(array_agg(e.latitude ORDER BY e.created_at DESC), NULL))[1] AS latitude,
      (array_remove(array_agg(e.longitude ORDER BY e.created_at DESC), NULL))[1] AS longitude,
      (array_remove(array_agg(e.user_agent ORDER BY e.created_at DESC), NULL))[1] AS user_agent,
      min(e.created_at) AS first_seen_at,
      max(e.created_at) AS last_seen_at,
      EXISTS (
        SELECT 1 FROM ip_bans b
        WHERE b.status = 'active'
          AND b.ip_address IS NOT NULL
          AND b.ip_address = e.ip_address
      ) AS already_banned
    FROM access_events e
    WHERE e.event_type = 'login'
      AND e.created_at >= ${since}
    GROUP BY e.ip_address, e.attempted_identifier
    HAVING count(*) >= ${minAttempts}
    ORDER BY count(*) FILTER (WHERE e.outcome = 'login_failed') DESC, count(*) DESC
    LIMIT ${limit}
  `)

  const items = Array.isArray(rows) ? rows : (rows as { rows?: unknown[] }).rows ?? []

  return (items as Array<Record<string, unknown>>).map((row) => {
    const attempts = Number(row.attempts ?? 0)
    const distinctPasswords = Number(row.distinct_passwords ?? 0)
    return {
      key: `${row.ip_text ?? 'unknown'}|${row.attempted_identifier ?? 'unknown'}`,
      ipAddress: (row.ip_text as string | null) ?? null,
      attemptedIdentifier: (row.attempted_identifier as string | null) ?? null,
      attempts,
      failedAttempts: Number(row.failed_attempts ?? 0),
      blockedAttempts: Number(row.blocked_attempts ?? 0),
      successfulLogins: Number(row.successful_logins ?? 0),
      distinctPasswords,
      repeatedSamePassword: distinctPasswords === 1 && attempts > 1,
      accountExists: (row.account_exists as boolean | null) ?? null,
      portals: (row.portals as string[] | null) ?? [],
      failureReasons: (row.failure_reasons as string[] | null) ?? [],
      locationLabel: (row.location_label as string | null) ?? null,
      country: (row.country as string | null) ?? null,
      latitude: row.latitude == null ? null : Number(row.latitude),
      longitude: row.longitude == null ? null : Number(row.longitude),
      userAgent: (row.user_agent as string | null) ?? null,
      firstSeenAt: new Date(row.first_seen_at as string).toISOString(),
      lastSeenAt: new Date(row.last_seen_at as string).toISOString(),
      alreadyBanned: Boolean(row.already_banned),
    }
  })
}

export interface SecurityOverview {
  totalEvents: number
  events24h: number
  blocked24h: number
  wouldBlock24h: number
  failedLogins24h: number
  successfulLogins24h: number
  uniqueIps24h: number
  unmappedEvents: number
}

export async function getSecurityOverview(db: Db): Promise<SecurityOverview> {
  const since = new Date(Date.now() - 24 * 3600_000)
  const [row] = await db.select({
    totalEvents: sql<number>`count(*)::int`,
    events24h: sql<number>`count(*) FILTER (WHERE ${accessEvents.createdAt} >= ${since})::int`,
    blocked24h: sql<number>`count(*) FILTER (WHERE ${accessEvents.createdAt} >= ${since} AND ${accessEvents.outcome} = 'blocked')::int`,
    wouldBlock24h: sql<number>`count(*) FILTER (WHERE ${accessEvents.createdAt} >= ${since} AND ${accessEvents.outcome} = 'would_block')::int`,
    failedLogins24h: sql<number>`count(*) FILTER (WHERE ${accessEvents.createdAt} >= ${since} AND ${accessEvents.outcome} = 'login_failed')::int`,
    successfulLogins24h: sql<number>`count(*) FILTER (WHERE ${accessEvents.createdAt} >= ${since} AND ${accessEvents.outcome} = 'login_success')::int`,
    uniqueIps24h: sql<number>`count(DISTINCT ${accessEvents.ipAddress}) FILTER (WHERE ${accessEvents.createdAt} >= ${since})::int`,
    unmappedEvents: sql<number>`count(*) FILTER (WHERE ${accessEvents.latitude} IS NULL AND ${accessEvents.ipAddress} IS NOT NULL)::int`,
  }).from(accessEvents)

  return {
    totalEvents: Number(row?.totalEvents ?? 0),
    events24h: Number(row?.events24h ?? 0),
    blocked24h: Number(row?.blocked24h ?? 0),
    wouldBlock24h: Number(row?.wouldBlock24h ?? 0),
    failedLogins24h: Number(row?.failedLogins24h ?? 0),
    successfulLogins24h: Number(row?.successfulLogins24h ?? 0),
    uniqueIps24h: Number(row?.uniqueIps24h ?? 0),
    unmappedEvents: Number(row?.unmappedEvents ?? 0),
  }
}

/** Retention: drop events older than the configured window. */
export async function pruneAccessEvents(db: Db, keepDays = 90): Promise<number> {
  const cutoff = new Date(Date.now() - keepDays * 24 * 60 * 60 * 1000)
  const rows = await db.delete(accessEvents)
    .where(lt(accessEvents.createdAt, cutoff))
    .returning({ id: accessEvents.id })
  return rows.length
}
