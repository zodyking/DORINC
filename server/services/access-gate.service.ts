import { and, desc, eq, lt } from 'drizzle-orm'
import type { Db } from '../db/client'
import { appSettings } from '../db/schema/settings'
import { accessEvents } from '../db/schema/access-gate'
import {
  type AccessGateSettings,
  DEFAULT_ACCESS_GATE_SETTINGS,
  accessGateSettingsSchema,
} from '../../shared/validators/access-gate'
import { isPointInPolygon } from '../../shared/geo/point-in-polygon'
import { normalizeClientIp } from '../utils/client-ip'

export const ACCESS_GATE_SETTINGS_KEY = 'security.access_gate'

let cache: AccessGateSettings = { ...DEFAULT_ACCESS_GATE_SETTINGS }

/** In-memory settings for the hot request path. Defaults to fully disabled. */
export function getCachedAccessGateSettings(): AccessGateSettings {
  return cache
}

async function readSettings(db: Db): Promise<AccessGateSettings> {
  const [row] = await db.select({ value: appSettings.value })
    .from(appSettings)
    .where(eq(appSettings.key, ACCESS_GATE_SETTINGS_KEY))
    .limit(1)
  return accessGateSettingsSchema.parse({
    ...DEFAULT_ACCESS_GATE_SETTINGS,
    ...(row?.value as Partial<AccessGateSettings> | null ?? {}),
  })
}

export async function refreshAccessGateCache(db: Db): Promise<void> {
  try {
    cache = await readSettings(db)
  }
  catch {
    cache = { ...DEFAULT_ACCESS_GATE_SETTINGS }
  }
}

export async function getAccessGateSettings(db: Db): Promise<AccessGateSettings> {
  return readSettings(db)
}

export async function saveAccessGateSettings(
  db: Db,
  input: AccessGateSettings,
  updatedBy: string | null,
): Promise<AccessGateSettings> {
  const settings = accessGateSettingsSchema.parse(input)
  // De-duplicate + normalize banned IPs.
  settings.bannedIps = [...new Set(
    settings.bannedIps
      .map(ip => normalizeClientIp(ip) ?? ip.trim())
      .filter(Boolean),
  )]

  const [existing] = await db.select({ id: appSettings.id })
    .from(appSettings)
    .where(eq(appSettings.key, ACCESS_GATE_SETTINGS_KEY))
    .limit(1)

  if (existing) {
    await db.update(appSettings)
      .set({ value: settings, updatedBy, updatedAt: new Date() })
      .where(eq(appSettings.key, ACCESS_GATE_SETTINGS_KEY))
  }
  else {
    await db.insert(appSettings).values({
      key: ACCESS_GATE_SETTINGS_KEY,
      value: settings,
      updatedBy,
    })
  }

  cache = settings
  return settings
}

export type AccessBlockReason = 'ip_banned' | 'geo_outside'

export interface AccessDecision {
  blocked: boolean
  reason: AccessBlockReason | null
}

const ALLOWED: AccessDecision = { blocked: false, reason: null }

/**
 * Pure enforcement decision. Fails open (allowed) whenever the gate is off,
 * the mode does not apply, or the required signal (coordinates) is unknown.
 */
export function evaluateAccessDecision(
  settings: AccessGateSettings,
  input: { ip: string | null, coords: { lat: number, lng: number } | null },
): AccessDecision {
  if (!settings.enabled || settings.blockMode === 'off') return ALLOWED

  const checksIp = settings.blockMode === 'ip' || settings.blockMode === 'both'
  const checksGeo = settings.blockMode === 'geo' || settings.blockMode === 'both'

  if (checksIp && input.ip) {
    const normalized = normalizeClientIp(input.ip) ?? input.ip
    if (settings.bannedIps.includes(normalized)) {
      return { blocked: true, reason: 'ip_banned' }
    }
  }

  if (checksGeo && settings.allowedPolygon.length >= 3 && input.coords) {
    if (!isPointInPolygon(input.coords, settings.allowedPolygon)) {
      return { blocked: true, reason: 'geo_outside' }
    }
  }

  return ALLOWED
}

export interface RecordAccessEventInput {
  eventType: 'visit' | 'login'
  outcome?: 'allowed' | 'blocked' | 'login_success' | 'login_failed'
  ipAddress?: string | null
  userId?: string | null
  userName?: string | null
  userEmail?: string | null
  path?: string | null
  userAgent?: string | null
  latitude?: number | null
  longitude?: number | null
  locationLabel?: string | null
  country?: string | null
}

export async function recordAccessEvent(db: Db, input: RecordAccessEventInput): Promise<void> {
  await db.insert(accessEvents).values({
    eventType: input.eventType,
    outcome: input.outcome ?? 'allowed',
    ipAddress: input.ipAddress ?? null,
    userId: input.userId ?? null,
    userName: input.userName ?? null,
    userEmail: input.userEmail ?? null,
    path: input.path ?? null,
    userAgent: input.userAgent ? input.userAgent.slice(0, 500) : null,
    latitude: input.latitude ?? null,
    longitude: input.longitude ?? null,
    locationLabel: input.locationLabel ?? null,
    country: input.country ?? null,
  })
}

export interface AccessEventView {
  id: string
  eventType: 'visit' | 'login'
  outcome: string
  ipAddress: string | null
  userId: string | null
  userName: string | null
  userEmail: string | null
  path: string | null
  latitude: number | null
  longitude: number | null
  locationLabel: string | null
  country: string | null
  createdAt: string
}

export async function listAccessEvents(
  db: Db,
  filter: { eventType?: 'visit' | 'login', limit?: number } = {},
): Promise<AccessEventView[]> {
  const limit = Math.min(Math.max(filter.limit ?? 1000, 1), 5000)
  const conditions = filter.eventType ? [eq(accessEvents.eventType, filter.eventType)] : []

  const rows = await db.select()
    .from(accessEvents)
    .where(conditions.length ? and(...conditions) : undefined)
    .orderBy(desc(accessEvents.createdAt))
    .limit(limit)

  return rows.map(r => ({
    id: r.id,
    eventType: r.eventType,
    outcome: r.outcome,
    ipAddress: r.ipAddress,
    userId: r.userId,
    userName: r.userName,
    userEmail: r.userEmail,
    path: r.path,
    latitude: r.latitude,
    longitude: r.longitude,
    locationLabel: r.locationLabel,
    country: r.country,
    createdAt: r.createdAt.toISOString(),
  }))
}

/** Best-effort retention: drop events older than the given number of days. */
export async function pruneAccessEvents(db: Db, keepDays = 30): Promise<void> {
  const cutoff = new Date(Date.now() - keepDays * 24 * 60 * 60 * 1000)
  await db.delete(accessEvents).where(lt(accessEvents.createdAt, cutoff))
}
