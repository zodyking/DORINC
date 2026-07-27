import { and, eq, isNull, or, gt } from 'drizzle-orm'
import type { Db } from '../../db/client'
import { appSettings } from '../../db/schema/settings'
import { geofences, ipBans } from '../../db/schema/security-access'
import { parseIpRule } from '../../../shared/net/ip-match'
import {
  DEFAULT_SECURITY_POLICY,
  type SecurityPolicy,
  securityPolicySchema,
} from '../../../shared/validators/security'
import type { BanEntry, SecuritySnapshot, ZoneEntry } from './evaluate'

export const SECURITY_POLICY_SETTINGS_KEY = 'security.policy'

/** Worst-case staleness for a rule change to reach another app instance. */
const SNAPSHOT_TTL_MS = 15_000

let snapshot: SecuritySnapshot = {
  policy: { ...DEFAULT_SECURITY_POLICY },
  bans: [],
  zones: [],
  loadedAt: 0,
}

let refreshing: Promise<void> | null = null

/** Synchronous snapshot for the hot request path. Never hits the database. */
export function getSecuritySnapshot(): SecuritySnapshot {
  return snapshot
}

export async function readSecurityPolicy(db: Db): Promise<SecurityPolicy> {
  const [row] = await db.select({ value: appSettings.value })
    .from(appSettings)
    .where(eq(appSettings.key, SECURITY_POLICY_SETTINGS_KEY))
    .limit(1)

  const parsed = securityPolicySchema.safeParse({
    ...DEFAULT_SECURITY_POLICY,
    ...(row?.value as Partial<SecurityPolicy> | null ?? {}),
  })
  return parsed.success ? parsed.data : { ...DEFAULT_SECURITY_POLICY }
}

async function loadBans(db: Db): Promise<BanEntry[]> {
  const now = new Date()
  const rows = await db.select({
    id: ipBans.id,
    ipRule: ipBans.ipRule,
    reason: ipBans.reason,
    expiresAt: ipBans.expiresAt,
  })
    .from(ipBans)
    .where(and(
      eq(ipBans.status, 'active'),
      or(isNull(ipBans.expiresAt), gt(ipBans.expiresAt, now)),
    ))

  const entries: BanEntry[] = []
  for (const row of rows) {
    const rule = parseIpRule(row.ipRule)
    // A row that no longer parses would silently match nothing; skip it loudly.
    if (!rule) {
      console.warn(`[security] ignoring unparseable ban rule "${row.ipRule}"`)
      continue
    }
    entries.push({ id: row.id, ipRule: row.ipRule, rule, reason: row.reason, expiresAt: row.expiresAt })
  }
  return entries
}

async function loadZones(db: Db): Promise<ZoneEntry[]> {
  const rows = await db.select({
    id: geofences.id,
    name: geofences.name,
    kind: geofences.kind,
    polygon: geofences.polygon,
    minLat: geofences.minLat,
    maxLat: geofences.maxLat,
    minLng: geofences.minLng,
    maxLng: geofences.maxLng,
  })
    .from(geofences)
    .where(eq(geofences.enabled, true))

  return rows.map(row => ({
    id: row.id,
    name: row.name,
    kind: row.kind,
    polygon: Array.isArray(row.polygon) ? row.polygon : [],
    minLat: row.minLat,
    maxLat: row.maxLat,
    minLng: row.minLng,
    maxLng: row.maxLng,
  }))
}

/** Reload policy, bans, and zones into the in-memory snapshot. */
export async function refreshSecuritySnapshot(db: Db): Promise<SecuritySnapshot> {
  try {
    const [policy, bans, zones] = await Promise.all([
      readSecurityPolicy(db),
      loadBans(db),
      loadZones(db),
    ])
    snapshot = { policy, bans, zones, loadedAt: Date.now() }
  }
  catch (err) {
    // Keep serving the last good snapshot rather than dropping enforcement.
    console.warn(`[security] snapshot refresh failed: ${(err as Error).message}`)
    snapshot = { ...snapshot, loadedAt: Date.now() }
  }
  return snapshot
}

/**
 * Refresh in the background when the snapshot has aged out. Callers do not
 * await this — it exists so a rule saved on one app instance reaches the others
 * without a restart or a per-request query.
 */
export function scheduleSnapshotRefresh(db: Db): void {
  if (refreshing) return
  if (Date.now() - snapshot.loadedAt < SNAPSHOT_TTL_MS) return
  refreshing = refreshSecuritySnapshot(db)
    .then(() => undefined)
    .catch(() => undefined)
    .finally(() => { refreshing = null })
}

export async function saveSecurityPolicy(
  db: Db,
  input: unknown,
  updatedBy: string | null,
): Promise<SecurityPolicy> {
  const policy = securityPolicySchema.parse(input)

  const [existing] = await db.select({ id: appSettings.id })
    .from(appSettings)
    .where(eq(appSettings.key, SECURITY_POLICY_SETTINGS_KEY))
    .limit(1)

  if (existing) {
    await db.update(appSettings)
      .set({ value: policy, updatedBy, updatedAt: new Date() })
      .where(eq(appSettings.key, SECURITY_POLICY_SETTINGS_KEY))
  }
  else {
    await db.insert(appSettings).values({
      key: SECURITY_POLICY_SETTINGS_KEY,
      value: policy,
      updatedBy,
    })
  }

  await refreshSecuritySnapshot(db)
  return policy
}

/** Test hook — replaces the cached snapshot outright. */
export function setSecuritySnapshotForTests(next: Partial<SecuritySnapshot>): void {
  snapshot = {
    policy: next.policy ?? { ...DEFAULT_SECURITY_POLICY },
    bans: next.bans ?? [],
    zones: next.zones ?? [],
    loadedAt: next.loadedAt ?? Date.now(),
  }
}
