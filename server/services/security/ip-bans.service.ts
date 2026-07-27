import { and, desc, eq, gt, ilike, isNull, lte, or, sql } from 'drizzle-orm'
import type { Db } from '../../db/client'
import { ipBans } from '../../db/schema/security-access'
import { parseIpRule } from '../../../shared/net/ip-match'
import type { IpBanSource, IpBanStatus } from '../../../shared/validators/security'
import { refreshSecuritySnapshot } from './policy.service'

export interface IpBanView {
  id: string
  ipRule: string
  kind: 'single' | 'range'
  family: number
  reason: string
  notes: string
  source: IpBanSource
  status: IpBanStatus
  expiresAt: string | null
  createdBy: string | null
  createdByName: string | null
  createdByEmail: string | null
  liftedAt: string | null
  liftedByName: string | null
  liftReason: string | null
  hitCount: number
  lastHitAt: string | null
  triggerAttempts: number
  lastLocationLabel: string | null
  lastCountry: string | null
  lastLatitude: number | null
  lastLongitude: number | null
  lastUserAgent: string | null
  lastIdentifiers: string[]
  createdAt: string
  updatedAt: string
}

type IpBanRow = typeof ipBans.$inferSelect

function toView(row: IpBanRow): IpBanView {
  return {
    id: row.id,
    ipRule: row.ipRule,
    kind: row.kind,
    family: row.family,
    reason: row.reason,
    notes: row.notes,
    source: row.source,
    status: row.status,
    expiresAt: row.expiresAt?.toISOString() ?? null,
    createdBy: row.createdBy,
    createdByName: row.createdByName,
    createdByEmail: row.createdByEmail,
    liftedAt: row.liftedAt?.toISOString() ?? null,
    liftedByName: row.liftedByName,
    liftReason: row.liftReason,
    hitCount: row.hitCount,
    lastHitAt: row.lastHitAt?.toISOString() ?? null,
    triggerAttempts: row.triggerAttempts,
    lastLocationLabel: row.lastLocationLabel,
    lastCountry: row.lastCountry,
    lastLatitude: row.lastLatitude,
    lastLongitude: row.lastLongitude,
    lastUserAgent: row.lastUserAgent,
    lastIdentifiers: Array.isArray(row.lastIdentifiers) ? row.lastIdentifiers : [],
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  }
}

export class IpBanError extends Error {
  constructor(public code: 'INVALID_RULE' | 'DUPLICATE' | 'NOT_FOUND', message: string) {
    super(message)
    this.name = 'IpBanError'
  }
}

export interface CreateIpBanInput {
  ipRule: string
  reason?: string
  notes?: string
  expiresAt?: string | Date | null
  source?: IpBanSource
  triggerAttempts?: number
  actor?: { id: string | null, name: string | null, email: string | null } | null
  /** Seeded from the event that prompted the ban so the table reads well. */
  observed?: {
    locationLabel?: string | null
    country?: string | null
    latitude?: number | null
    longitude?: number | null
    userAgent?: string | null
    identifiers?: string[]
  } | null
}

/**
 * Create a ban, or revive an existing row for the same rule. Reusing the row
 * keeps the ban's history (hit counts, prior lift reason) intact instead of
 * accumulating duplicates for a repeat offender.
 */
export async function createIpBan(db: Db, input: CreateIpBanInput): Promise<IpBanView> {
  const rule = parseIpRule(input.ipRule)
  if (!rule) throw new IpBanError('INVALID_RULE', `"${input.ipRule}" is not a valid IP address or CIDR range`)

  const expiresAt = input.expiresAt ? new Date(input.expiresAt) : null
  if (expiresAt && Number.isNaN(expiresAt.getTime())) {
    throw new IpBanError('INVALID_RULE', 'Expiry is not a valid date')
  }

  const observed = input.observed ?? {}
  const identifiers = (observed.identifiers ?? []).filter(Boolean).slice(0, 25)

  const values = {
    ipRule: rule.canonical,
    ipAddress: rule.kind === 'single' ? rule.canonical : null,
    kind: rule.kind,
    family: rule.family,
    reason: input.reason?.trim() ?? '',
    notes: input.notes?.trim() ?? '',
    source: input.source ?? 'manual',
    status: 'active' as const,
    expiresAt,
    createdBy: input.actor?.id ?? null,
    createdByName: input.actor?.name ?? null,
    createdByEmail: input.actor?.email ?? null,
    liftedAt: null,
    liftedBy: null,
    liftedByName: null,
    liftReason: null,
    triggerAttempts: input.triggerAttempts ?? 0,
    lastLocationLabel: observed.locationLabel ?? null,
    lastCountry: observed.country ?? null,
    lastLatitude: observed.latitude ?? null,
    lastLongitude: observed.longitude ?? null,
    lastUserAgent: observed.userAgent ?? null,
    lastIdentifiers: identifiers,
    updatedAt: new Date(),
  }

  const [row] = await db.insert(ipBans)
    .values(values)
    .onConflictDoUpdate({
      target: ipBans.ipRule,
      set: {
        reason: values.reason,
        notes: values.notes,
        source: values.source,
        status: 'active',
        expiresAt: values.expiresAt,
        createdBy: values.createdBy,
        createdByName: values.createdByName,
        createdByEmail: values.createdByEmail,
        liftedAt: null,
        liftedBy: null,
        liftedByName: null,
        liftReason: null,
        updatedAt: values.updatedAt,
      },
    })
    .returning()

  await refreshSecuritySnapshot(db)
  return toView(row!)
}

export interface UpdateIpBanInput {
  reason?: string
  notes?: string
  expiresAt?: string | null
  status?: IpBanStatus
  liftReason?: string
  actor?: { id: string | null, name: string | null } | null
}

export async function updateIpBan(db: Db, id: string, input: UpdateIpBanInput): Promise<IpBanView> {
  const patch: Partial<typeof ipBans.$inferInsert> = { updatedAt: new Date() }

  if (input.reason !== undefined) patch.reason = input.reason.trim()
  if (input.notes !== undefined) patch.notes = input.notes.trim()
  if (input.expiresAt !== undefined) {
    patch.expiresAt = input.expiresAt ? new Date(input.expiresAt) : null
  }
  if (input.status !== undefined) {
    patch.status = input.status
    if (input.status === 'lifted') {
      patch.liftedAt = new Date()
      patch.liftedBy = input.actor?.id ?? null
      patch.liftedByName = input.actor?.name ?? null
      patch.liftReason = input.liftReason?.trim() ?? null
    }
    else if (input.status === 'active') {
      patch.liftedAt = null
      patch.liftedBy = null
      patch.liftedByName = null
      patch.liftReason = null
    }
  }

  const [row] = await db.update(ipBans).set(patch).where(eq(ipBans.id, id)).returning()
  if (!row) throw new IpBanError('NOT_FOUND', 'Ban not found')

  await refreshSecuritySnapshot(db)
  return toView(row)
}

export async function deleteIpBan(db: Db, id: string): Promise<IpBanView> {
  const [row] = await db.delete(ipBans).where(eq(ipBans.id, id)).returning()
  if (!row) throw new IpBanError('NOT_FOUND', 'Ban not found')
  await refreshSecuritySnapshot(db)
  return toView(row)
}

export interface ListIpBansFilter {
  status?: IpBanStatus | 'all'
  search?: string
  limit?: number
  offset?: number
}

export async function listIpBans(
  db: Db,
  filter: ListIpBansFilter = {},
): Promise<{ items: IpBanView[], total: number }> {
  const limit = Math.min(Math.max(filter.limit ?? 200, 1), 500)
  const offset = Math.max(filter.offset ?? 0, 0)

  const conditions = []
  if (filter.status && filter.status !== 'all') conditions.push(eq(ipBans.status, filter.status))
  if (filter.search) {
    const term = `%${filter.search}%`
    conditions.push(or(
      ilike(ipBans.ipRule, term),
      ilike(ipBans.reason, term),
      ilike(ipBans.notes, term),
      ilike(ipBans.lastLocationLabel, term),
    ))
  }
  const where = conditions.length ? and(...conditions) : undefined

  const [rows, [count]] = await Promise.all([
    db.select().from(ipBans).where(where).orderBy(desc(ipBans.createdAt)).limit(limit).offset(offset),
    db.select({ value: sql<number>`count(*)::int` }).from(ipBans).where(where),
  ])

  return { items: rows.map(toView), total: Number(count?.value ?? 0) }
}

export async function getIpBan(db: Db, id: string): Promise<IpBanView | null> {
  const [row] = await db.select().from(ipBans).where(eq(ipBans.id, id)).limit(1)
  return row ? toView(row) : null
}

/**
 * Fold what we just learned about a blocked request back into its ban row so
 * the table shows hit counts, last location, and which logins were attempted.
 */
export async function recordBanHit(
  db: Db,
  banId: string,
  observed: {
    locationLabel?: string | null
    country?: string | null
    latitude?: number | null
    longitude?: number | null
    userAgent?: string | null
    identifier?: string | null
  } = {},
): Promise<void> {
  const identifier = observed.identifier?.trim().toLowerCase() || null
  await db.update(ipBans)
    .set({
      hitCount: sql`${ipBans.hitCount} + 1`,
      lastHitAt: new Date(),
      lastLocationLabel: observed.locationLabel ?? sql`${ipBans.lastLocationLabel}`,
      lastCountry: observed.country ?? sql`${ipBans.lastCountry}`,
      lastLatitude: observed.latitude ?? sql`${ipBans.lastLatitude}`,
      lastLongitude: observed.longitude ?? sql`${ipBans.lastLongitude}`,
      lastUserAgent: observed.userAgent?.slice(0, 500) ?? sql`${ipBans.lastUserAgent}`,
      lastIdentifiers: identifier
        ? sql`(
            SELECT coalesce(jsonb_agg(value), '[]'::jsonb)
            FROM (
              SELECT DISTINCT value
              FROM jsonb_array_elements_text(${ipBans.lastIdentifiers} || to_jsonb(${identifier}::text)) AS value
              LIMIT 25
            ) AS distinct_values
          )`
        : sql`${ipBans.lastIdentifiers}`,
      updatedAt: new Date(),
    })
    .where(eq(ipBans.id, banId))
}

/** Flip time-limited bans to `expired` so the UI and snapshot agree. */
export async function expireDueBans(db: Db): Promise<number> {
  const rows = await db.update(ipBans)
    .set({ status: 'expired', updatedAt: new Date() })
    .where(and(
      eq(ipBans.status, 'active'),
      lte(ipBans.expiresAt, new Date()),
    ))
    .returning({ id: ipBans.id })

  if (rows.length) await refreshSecuritySnapshot(db)
  return rows.length
}

export async function countActiveBans(db: Db): Promise<number> {
  const [row] = await db.select({ value: sql<number>`count(*)::int` })
    .from(ipBans)
    .where(and(
      eq(ipBans.status, 'active'),
      or(isNull(ipBans.expiresAt), gt(ipBans.expiresAt, new Date())),
    ))
  return Number(row?.value ?? 0)
}
