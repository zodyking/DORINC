// Integration tests for the rebuilt IP ban / geofence stack against PostgreSQL.
// Exercises the runtime DDL, the ban and zone services, event capture, and the
// threat aggregation query that powers the repeated-attempt table.
import { config } from 'dotenv'
import { eq, inArray, like, sql } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/node-postgres'
import { Pool } from 'pg'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { ensureSecuritySchema } from '../../server/lib/ensure-security-schema.mjs'
import { accessEvents, geofences, ipBans } from '../../server/db/schema/security-access'
import {
  getSecurityOverview,
  listAccessEvents,
  listThreatGroups,
  pruneAccessEvents,
  recordAccessEvent,
} from '../../server/services/security/access-events.service'
import {
  countActiveBans,
  createIpBan,
  deleteIpBan,
  expireDueBans,
  IpBanError,
  listIpBans,
  recordBanHit,
  updateIpBan,
} from '../../server/services/security/ip-bans.service'
import {
  createGeofence,
  deleteGeofence,
  GeofenceError,
  listGeofences,
  recordGeofenceHit,
  updateGeofence,
} from '../../server/services/security/geofences.service'
import {
  getSecuritySnapshot,
  refreshSecuritySnapshot,
  saveSecurityPolicy,
  SECURITY_POLICY_SETTINGS_KEY,
} from '../../server/services/security/policy.service'
import { appSettings } from '../../server/db/schema/settings'
import { evaluateAccess } from '../../server/services/security/evaluate'
import { DEFAULT_SECURITY_POLICY } from '../../shared/validators/security-access'

config()

const pool = new Pool({ connectionString: process.env.DATABASE_URL })
const db = drizzle({ client: pool })

/** Test fixtures live in 198.51.100.0/24 (RFC 5737 TEST-NET-2). */
const TEST_NET = '198.51.100.'
const TEST_ZONE_PREFIX = 'sectest-zone-'
const TEST_IDENTIFIER_PREFIX = 'sectest-'

/** A square around the New York metro area. */
const SQUARE = [
  { lat: 40, lng: -75 },
  { lat: 40, lng: -73 },
  { lat: 42, lng: -73 },
  { lat: 42, lng: -75 },
]

async function cleanup() {
  await db.delete(accessEvents).where(sql`host(${accessEvents.ipAddress}) LIKE ${`${TEST_NET}%`}`)
  await db.delete(ipBans).where(like(ipBans.ipRule, `${TEST_NET}%`))
  await db.delete(geofences).where(like(geofences.name, `${TEST_ZONE_PREFIX}%`))
}

beforeAll(async () => {
  await ensureSecuritySchema(pool)
  await cleanup()
})

afterAll(async () => {
  await cleanup()
  await db.delete(appSettings).where(eq(appSettings.key, SECURITY_POLICY_SETTINGS_KEY))
  await pool.end()
})

describe('ensureSecuritySchema', () => {
  it('creates the three security tables', async () => {
    const { rows } = await pool.query(
      `SELECT table_name FROM information_schema.tables
       WHERE table_schema = 'public' AND table_name = ANY($1)`,
      [['ip_bans', 'geofences', 'access_events']],
    )
    expect(rows.map(r => r.table_name).sort()).toEqual(['access_events', 'geofences', 'ip_bans'])
  })

  it('adds the credential and decision columns to access_events', async () => {
    const { rows } = await pool.query(
      `SELECT column_name FROM information_schema.columns
       WHERE table_schema = 'public' AND table_name = 'access_events'`,
    )
    const columns = new Set(rows.map(r => r.column_name))
    for (const column of [
      'stage', 'block_reason', 'enforced', 'matched_ip_rule', 'matched_ban_id',
      'matched_geofence_id', 'geo_source', 'accuracy_m', 'attempted_identifier',
      'password_fingerprint', 'password_length', 'account_exists', 'failure_reason',
    ]) {
      expect(columns, `missing column ${column}`).toContain(column)
    }
  })

  it('is safe to run twice', async () => {
    await expect(ensureSecuritySchema(pool)).resolves.toBeUndefined()
  })
})

describe('ip bans', () => {
  it('creates, lists, and canonicalizes a ban', async () => {
    const created = await createIpBan(db, {
      ipRule: `${TEST_NET}77/24`,
      reason: 'Credential stuffing',
      actor: { id: null, name: 'Test Admin', email: 'admin@test.local' },
    })

    expect(created.ipRule).toBe(`${TEST_NET}0/24`)
    expect(created.kind).toBe('range')
    expect(created.status).toBe('active')

    const listed = await listIpBans(db, { status: 'active', search: TEST_NET })
    expect(listed.items.map(b => b.id)).toContain(created.id)
    await deleteIpBan(db, created.id)
  })

  it('rejects an unparseable rule', async () => {
    await expect(createIpBan(db, { ipRule: 'not-an-ip' })).rejects.toBeInstanceOf(IpBanError)
  })

  it('revives an existing row instead of duplicating it', async () => {
    const first = await createIpBan(db, { ipRule: `${TEST_NET}5`, reason: 'first' })
    await updateIpBan(db, first.id, { status: 'lifted', liftReason: 'false positive' })

    const second = await createIpBan(db, { ipRule: `${TEST_NET}5`, reason: 'back again' })
    expect(second.id).toBe(first.id)
    expect(second.status).toBe('active')
    expect(second.liftReason).toBeNull()

    const listed = await listIpBans(db, { status: 'all', search: `${TEST_NET}5` })
    expect(listed.items.filter(b => b.ipRule === `${TEST_NET}5`)).toHaveLength(1)
    await deleteIpBan(db, first.id)
  })

  it('accumulates hit detail on the ban row', async () => {
    const ban = await createIpBan(db, { ipRule: `${TEST_NET}9` })
    await recordBanHit(db, ban.id, { locationLabel: 'Newark, NJ', country: 'US', identifier: 'Root@Example.COM' })
    await recordBanHit(db, ban.id, { identifier: 'admin@example.com' })
    await recordBanHit(db, ban.id, { identifier: 'root@example.com' })

    const [after] = (await listIpBans(db, { status: 'all', search: `${TEST_NET}9` })).items
    expect(after?.hitCount).toBe(3)
    expect(after?.lastLocationLabel).toBe('Newark, NJ')
    expect(after?.lastIdentifiers.sort()).toEqual(['admin@example.com', 'root@example.com'])
    await deleteIpBan(db, ban.id)
  })

  it('expires a ban whose window has passed', async () => {
    const ban = await createIpBan(db, {
      ipRule: `${TEST_NET}11`,
      expiresAt: new Date(Date.now() - 60_000).toISOString(),
    })
    const before = await countActiveBans(db)

    expect(await expireDueBans(db)).toBeGreaterThanOrEqual(1)

    const [after] = (await listIpBans(db, { status: 'all', search: `${TEST_NET}11` })).items
    expect(after?.status).toBe('expired')
    expect(await countActiveBans(db)).toBeLessThan(before + 1)
    await deleteIpBan(db, ban.id)
  })

  it('leaves an expired ban out of the enforcement snapshot', async () => {
    const live = await createIpBan(db, { ipRule: `${TEST_NET}21` })
    const dead = await createIpBan(db, {
      ipRule: `${TEST_NET}22`,
      expiresAt: new Date(Date.now() - 60_000).toISOString(),
    })

    const snapshot = await refreshSecuritySnapshot(db)
    const rules = snapshot.bans.map(b => b.ipRule)
    expect(rules).toContain(`${TEST_NET}21`)
    expect(rules).not.toContain(`${TEST_NET}22`)

    await deleteIpBan(db, live.id)
    await deleteIpBan(db, dead.id)
  })
})

describe('geofences', () => {
  it('stores a simplified polygon with its bounding box', async () => {
    const zone = await createGeofence(db, { name: `${TEST_ZONE_PREFIX}office`, polygon: SQUARE })
    expect(zone.pointCount).toBeGreaterThanOrEqual(3)

    const [row] = await db.select().from(geofences).where(eq(geofences.id, zone.id))
    expect(row?.minLat).toBe(40)
    expect(row?.maxLat).toBe(42)
    expect(row?.minLng).toBe(-75)
    expect(row?.maxLng).toBe(-73)

    await deleteGeofence(db, zone.id)
  })

  it('refuses a polygon with fewer than three points', async () => {
    await expect(createGeofence(db, {
      name: `${TEST_ZONE_PREFIX}bad`,
      polygon: [{ lat: 40, lng: -75 }, { lat: 41, lng: -74 }],
    })).rejects.toBeInstanceOf(GeofenceError)
  })

  it('recomputes bounds when the shape is replaced', async () => {
    const zone = await createGeofence(db, { name: `${TEST_ZONE_PREFIX}moving`, polygon: SQUARE })
    const shifted = SQUARE.map(p => ({ lat: p.lat + 10, lng: p.lng }))
    await updateGeofence(db, zone.id, { polygon: shifted })

    const [row] = await db.select().from(geofences).where(eq(geofences.id, zone.id))
    expect(row?.minLat).toBe(50)
    expect(row?.maxLat).toBe(52)

    await deleteGeofence(db, zone.id)
  })

  it('keeps a disabled zone out of the snapshot', async () => {
    const zone = await createGeofence(db, { name: `${TEST_ZONE_PREFIX}toggling`, polygon: SQUARE })
    expect((await refreshSecuritySnapshot(db)).zones.map(z => z.id)).toContain(zone.id)

    await updateGeofence(db, zone.id, { enabled: false })
    expect((await refreshSecuritySnapshot(db)).zones.map(z => z.id)).not.toContain(zone.id)

    expect((await listGeofences(db)).find(z => z.id === zone.id)?.enabled).toBe(false)
    await deleteGeofence(db, zone.id)
  })

  it('counts hits against the zone', async () => {
    const zone = await createGeofence(db, { name: `${TEST_ZONE_PREFIX}counted`, polygon: SQUARE })
    await recordGeofenceHit(db, zone.id)
    await recordGeofenceHit(db, zone.id)

    expect((await listGeofences(db)).find(z => z.id === zone.id)?.hitCount).toBe(2)
    await deleteGeofence(db, zone.id)
  })
})

describe('access events', () => {
  it('records a failed sign-in with its attempted credentials', async () => {
    const id = await recordAccessEvent(db, {
      eventType: 'login',
      stage: 'login_attempt',
      outcome: 'login_failed',
      ipAddress: `${TEST_NET}30`,
      attemptedIdentifier: `${TEST_IDENTIFIER_PREFIX}victim@example.com`,
      attemptedPortal: 'staff',
      passwordFingerprint: 'aabbccddeeff',
      passwordLength: 12,
      accountExists: true,
      failureReason: 'invalid_credentials',
      latitude: 40.7,
      longitude: -74,
      geoSource: 'ip',
      locationLabel: 'Jersey City, NJ',
      country: 'US',
    })
    expect(id).toBeTruthy()

    const { items } = await listAccessEvents(db, { search: `${TEST_NET}30`, limit: 10 })
    const event = items.find(e => e.id === id)
    expect(event).toMatchObject({
      outcome: 'login_failed',
      attemptedIdentifier: `${TEST_IDENTIFIER_PREFIX}victim@example.com`,
      passwordFingerprint: 'aabbccddeeff',
      passwordLength: 12,
      accountExists: true,
      failureReason: 'invalid_credentials',
      geoSource: 'ip',
    })
  })

  it('finds an event by the username that was tried', async () => {
    const { items } = await listAccessEvents(db, {
      search: `${TEST_IDENTIFIER_PREFIX}victim`,
      limit: 10,
    })
    expect(items.length).toBeGreaterThan(0)
  })

  it('filters to blocked outcomes only', async () => {
    await recordAccessEvent(db, {
      eventType: 'visit',
      outcome: 'blocked',
      blockReason: 'ip_banned',
      enforced: true,
      ipAddress: `${TEST_NET}31`,
      matchedIpRule: `${TEST_NET}0/24`,
      path: '/dashboard',
    })

    const { items } = await listAccessEvents(db, { outcome: 'blocked', search: `${TEST_NET}31` })
    expect(items).toHaveLength(1)
    expect(items[0]).toMatchObject({ blockReason: 'ip_banned', enforced: true, matchedIpRule: `${TEST_NET}0/24` })
  })

  it('summarises the last 24 hours', async () => {
    const overview = await getSecurityOverview(db)
    expect(overview.blocked24h).toBeGreaterThanOrEqual(1)
    expect(overview.failedLogins24h).toBeGreaterThanOrEqual(1)
    expect(overview.uniqueIps24h).toBeGreaterThanOrEqual(2)
  })
})

describe('threat grouping', () => {
  const attacker = `${TEST_NET}40`
  const target = `${TEST_IDENTIFIER_PREFIX}target@example.com`

  beforeAll(async () => {
    // Same password five times: a stuffing list replaying one leaked credential.
    for (let i = 0; i < 5; i++) {
      await recordAccessEvent(db, {
        eventType: 'login',
        stage: 'login_attempt',
        outcome: 'login_failed',
        ipAddress: attacker,
        attemptedIdentifier: target,
        attemptedPortal: 'staff',
        passwordFingerprint: 'deadbeef0000',
        passwordLength: 9,
        accountExists: true,
        failureReason: 'invalid_credentials',
        userAgent: 'Mozilla/5.0 (X11; Linux x86_64) Chrome/120.0.0.0',
        locationLabel: 'Somewhere, DE',
        country: 'DE',
      })
    }

    // Three different passwords from another host: a spray.
    for (const fingerprint of ['1111aaaa2222', '3333bbbb4444', '5555cccc6666']) {
      await recordAccessEvent(db, {
        eventType: 'login',
        stage: 'login_attempt',
        outcome: 'login_failed',
        ipAddress: `${TEST_NET}41`,
        attemptedIdentifier: `${TEST_IDENTIFIER_PREFIX}sprayed@example.com`,
        attemptedPortal: 'customer',
        passwordFingerprint: fingerprint,
        passwordLength: 10,
        accountExists: false,
        failureReason: 'invalid_credentials',
      })
    }
  })

  it('groups repeated attempts by source and username', async () => {
    const groups = await listThreatGroups(db, { sinceHours: 1, minAttempts: 2 })
    const stuffing = groups.find(g => g.ipAddress === attacker && g.attemptedIdentifier === target)

    expect(stuffing).toBeDefined()
    expect(stuffing).toMatchObject({
      attempts: 5,
      failedAttempts: 5,
      distinctPasswords: 1,
      repeatedSamePassword: true,
      accountExists: true,
      country: 'DE',
      alreadyBanned: false,
    })
    expect(stuffing?.portals).toEqual(['staff'])
    expect(stuffing?.failureReasons).toEqual(['invalid_credentials'])
  })

  it('separates a password spray from a repeated single password', async () => {
    const groups = await listThreatGroups(db, { sinceHours: 1, minAttempts: 2 })
    const spray = groups.find(g => g.ipAddress === `${TEST_NET}41`)

    expect(spray).toMatchObject({
      attempts: 3,
      distinctPasswords: 3,
      repeatedSamePassword: false,
      accountExists: false,
    })
  })

  it('marks a group whose address is already banned', async () => {
    const ban = await createIpBan(db, { ipRule: attacker, source: 'auto_failed_logins' })

    const groups = await listThreatGroups(db, { sinceHours: 1, minAttempts: 2 })
    expect(groups.find(g => g.ipAddress === attacker)?.alreadyBanned).toBe(true)

    await deleteIpBan(db, ban.id)
  })

  it('honours the minimum attempt threshold', async () => {
    const groups = await listThreatGroups(db, { sinceHours: 1, minAttempts: 4 })
    expect(groups.every(g => g.attempts >= 4)).toBe(true)
    expect(groups.some(g => g.ipAddress === `${TEST_NET}41`)).toBe(false)
  })
})

describe('policy and snapshot', () => {
  it('persists the policy and reloads it into the snapshot', async () => {
    await saveSecurityPolicy(db, {
      ...DEFAULT_SECURITY_POLICY,
      enabled: true,
      ipEnforcement: 'enforce',
      geoEnforcement: 'monitor',
      blockMessage: 'Nope.',
    }, null)

    const snapshot = getSecuritySnapshot()
    expect(snapshot.policy).toMatchObject({
      enabled: true,
      ipEnforcement: 'enforce',
      geoEnforcement: 'monitor',
      blockMessage: 'Nope.',
    })
  })

  it('blocks a banned address end to end through the snapshot', async () => {
    const ban = await createIpBan(db, { ipRule: `${TEST_NET}50`, reason: 'integration' })
    const snapshot = await refreshSecuritySnapshot(db)

    const blocked = evaluateAccess(snapshot, { ip: `${TEST_NET}50`, coords: null, geoSource: 'none' })
    expect(blocked).toMatchObject({ blocked: true, reason: 'ip_banned' })
    expect(blocked.matchedBan?.id).toBe(ban.id)

    const allowed = evaluateAccess(snapshot, { ip: '203.0.113.1', coords: null, geoSource: 'none' })
    expect(allowed.blocked).toBe(false)

    await deleteIpBan(db, ban.id)
    expect(evaluateAccess(await refreshSecuritySnapshot(db), {
      ip: `${TEST_NET}50`,
      coords: null,
      geoSource: 'none',
    }).blocked).toBe(false)
  })

  it('monitors but does not block a geofence miss at the configured level', async () => {
    const zone = await createGeofence(db, { name: `${TEST_ZONE_PREFIX}policy`, polygon: SQUARE })
    const snapshot = await refreshSecuritySnapshot(db)

    expect(evaluateAccess(snapshot, {
      ip: `${TEST_NET}51`,
      coords: { lat: 50, lng: -74 },
      geoSource: 'ip',
    })).toMatchObject({ blocked: false, wouldBlock: true, reason: 'geo_outside_allowed' })

    await deleteGeofence(db, zone.id)
  })
})

describe('retention', () => {
  it('drops events older than the keep window and leaves recent ones', async () => {
    const oldId = await recordAccessEvent(db, { eventType: 'visit', ipAddress: `${TEST_NET}60` })
    const freshId = await recordAccessEvent(db, { eventType: 'visit', ipAddress: `${TEST_NET}61` })
    await db.update(accessEvents)
      .set({ createdAt: new Date(Date.now() - 120 * 24 * 3600_000) })
      .where(eq(accessEvents.id, oldId!))

    expect(await pruneAccessEvents(db, 90)).toBeGreaterThanOrEqual(1)

    const remaining = await db.select({ id: accessEvents.id })
      .from(accessEvents)
      .where(inArray(accessEvents.id, [oldId!, freshId!]))
    expect(remaining.map(r => r.id)).toEqual([freshId])
  })
})
