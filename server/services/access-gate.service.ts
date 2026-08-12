import { and, asc, desc, eq, gte, ilike, isNull, lt, or, sql } from 'drizzle-orm'
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

export type AccessBlockReason = 'ip_banned' | 'geo_outside' | 'geo_unknown'

export interface AccessDecision {
  blocked: boolean
  reason: AccessBlockReason | null
}

const ALLOWED: AccessDecision = { blocked: false, reason: null }

export interface AccessDecisionOptions {
  /** When true, missing coordinates block geofence checks. Default: strict (fail closed). */
  strictGeo?: boolean
}

/**
 * Pure enforcement decision. Geofence checks fail closed when coordinates are
 * required but unknown unless `strictGeo` is set to false.
 */
export function evaluateAccessDecision(
  settings: AccessGateSettings,
  input: { ip: string | null, coords: { lat: number, lng: number } | null },
  options: AccessDecisionOptions = {},
): AccessDecision {
  const strictGeo = options.strictGeo !== false

  if (!settings.enabled || settings.blockMode === 'off') return ALLOWED

  const checksIp = settings.blockMode === 'ip' || settings.blockMode === 'both'
  const checksGeo = settings.blockMode === 'geo' || settings.blockMode === 'both'
  const geoActive = checksGeo && settings.allowedPolygon.length >= 3

  if (checksIp && input.ip) {
    const normalized = normalizeClientIp(input.ip) ?? input.ip
    if (settings.bannedIps.includes(normalized)) {
      return { blocked: true, reason: 'ip_banned' }
    }
  }

  if (geoActive) {
    if (!input.coords) {
      if (strictGeo) {
        return { blocked: true, reason: 'geo_unknown' }
      }
      return ALLOWED
    }
    if (!isPointInPolygon(input.coords, settings.allowedPolygon)) {
      return { blocked: true, reason: 'geo_outside' }
    }
  }

  return ALLOWED
}

export interface AccessEventDeviceFields {
  userAgent?: string | null
  deviceId?: string | null
  os?: string | null
  deviceType?: string | null
  screenResolution?: string | null
  devicePixelRatio?: number | null
  cpuCores?: number | null
  deviceMemoryGb?: number | null
  gpuRenderer?: string | null
  canvasFingerprint?: string | null
  webglFingerprint?: string | null
  audioFingerprint?: string | null
  timezone?: string | null
  language?: string | null
  maxTouchPoints?: number | null
}

export interface RecordAccessEventInput extends AccessEventDeviceFields {
  eventType: 'visit' | 'login'
  outcome?: 'allowed' | 'blocked' | 'login_success' | 'login_failed'
  /** Set when outcome is blocked — IP ban vs geofence. */
  blockReason?: AccessBlockReason | null
  ipAddress?: string | null
  userId?: string | null
  userName?: string | null
  userEmail?: string | null
  path?: string | null
  latitude?: number | null
  longitude?: number | null
  locationLabel?: string | null
  country?: string | null
}

function clip(value: string | null | undefined, max: number): string | null {
  if (!value) return null
  return value.length > max ? value.slice(0, max) : value
}

export async function recordAccessEvent(db: Db, input: RecordAccessEventInput): Promise<void> {
  const outcome = input.outcome ?? 'allowed'
  const blockReason = outcome === 'blocked' ? (input.blockReason ?? null) : null
  await db.insert(accessEvents).values({
    eventType: input.eventType,
    outcome,
    blockReason,
    ipAddress: input.ipAddress ?? null,
    userId: input.userId ?? null,
    userName: input.userName ?? null,
    userEmail: input.userEmail ?? null,
    path: input.path ?? null,
    userAgent: clip(input.userAgent, 500),
    deviceId: clip(input.deviceId, 64),
    os: clip(input.os, 120),
    deviceType: clip(input.deviceType, 32),
    screenResolution: clip(input.screenResolution, 40),
    devicePixelRatio: input.devicePixelRatio ?? null,
    cpuCores: input.cpuCores ?? null,
    deviceMemoryGb: input.deviceMemoryGb ?? null,
    gpuRenderer: clip(input.gpuRenderer, 300),
    canvasFingerprint: clip(input.canvasFingerprint, 128),
    webglFingerprint: clip(input.webglFingerprint, 128),
    audioFingerprint: clip(input.audioFingerprint, 128),
    timezone: clip(input.timezone, 80),
    language: clip(input.language, 80),
    maxTouchPoints: input.maxTouchPoints ?? null,
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
  blockReason: AccessBlockReason | null
  ipAddress: string | null
  userId: string | null
  userName: string | null
  userEmail: string | null
  path: string | null
  userAgent: string | null
  deviceId: string | null
  os: string | null
  deviceType: string | null
  screenResolution: string | null
  devicePixelRatio: number | null
  cpuCores: number | null
  deviceMemoryGb: number | null
  gpuRenderer: string | null
  canvasFingerprint: string | null
  webglFingerprint: string | null
  audioFingerprint: string | null
  timezone: string | null
  language: string | null
  maxTouchPoints: number | null
  latitude: number | null
  longitude: number | null
  locationLabel: string | null
  country: string | null
  createdAt: string
}

export type AccessEventSort
  = 'newest' | 'oldest' | 'outcome' | 'type' | 'user' | 'ip'

export async function listAccessEvents(
  db: Db,
  filter: {
    eventType?: 'visit' | 'login'
    /** Raw outcome filter. */
    outcome?: 'allowed' | 'blocked' | 'login_success' | 'login_failed'
    /** Display group filter (preferred for UI). */
    displayGroup?: 'access_granted' | 'fail' | 'geofence_blocked' | 'blocked'
    q?: string
    sort?: AccessEventSort
    limit?: number
    /** Inclusive start (ISO). */
    from?: string | Date | null
    /** Exclusive end (ISO). */
    to?: string | Date | null
  } = {},
): Promise<AccessEventView[]> {
  const limit = Math.min(Math.max(filter.limit ?? 1000, 1), 5000)
  const conditions = []
  if (filter.eventType) conditions.push(eq(accessEvents.eventType, filter.eventType))
  if (filter.outcome) conditions.push(eq(accessEvents.outcome, filter.outcome))
  if (filter.displayGroup === 'access_granted') {
    conditions.push(or(
      eq(accessEvents.outcome, 'allowed'),
      eq(accessEvents.outcome, 'login_success'),
    ))
  }
  else if (filter.displayGroup === 'fail') {
    conditions.push(eq(accessEvents.outcome, 'login_failed'))
  }
  else if (filter.displayGroup === 'geofence_blocked') {
    conditions.push(and(
      eq(accessEvents.outcome, 'blocked'),
      or(
        eq(accessEvents.blockReason, 'geo_outside'),
        eq(accessEvents.blockReason, 'geo_unknown'),
      ),
    ))
  }
  else if (filter.displayGroup === 'blocked') {
    conditions.push(and(
      eq(accessEvents.outcome, 'blocked'),
      or(
        eq(accessEvents.blockReason, 'ip_banned'),
        isNull(accessEvents.blockReason),
      ),
    ))
  }
  if (filter.q?.trim()) {
    const term = `%${filter.q.trim()}%`
    conditions.push(or(
      ilike(accessEvents.userName, term),
      ilike(accessEvents.userEmail, term),
      sql`cast(${accessEvents.ipAddress} as text) ilike ${term}`,
      ilike(accessEvents.path, term),
      ilike(accessEvents.deviceId, term),
      ilike(accessEvents.os, term),
      ilike(accessEvents.locationLabel, term),
    ))
  }
  if (filter.from) {
    const from = filter.from instanceof Date ? filter.from : new Date(filter.from)
    if (Number.isFinite(from.getTime())) conditions.push(gte(accessEvents.createdAt, from))
  }
  if (filter.to) {
    const to = filter.to instanceof Date ? filter.to : new Date(filter.to)
    if (Number.isFinite(to.getTime())) conditions.push(lt(accessEvents.createdAt, to))
  }

  const orderBy = (() => {
    switch (filter.sort) {
      case 'oldest': return [asc(accessEvents.createdAt)]
      case 'outcome': return [asc(accessEvents.outcome), desc(accessEvents.createdAt)]
      case 'type': return [asc(accessEvents.eventType), desc(accessEvents.createdAt)]
      case 'user': return [asc(accessEvents.userName), desc(accessEvents.createdAt)]
      case 'ip': return [asc(accessEvents.ipAddress), desc(accessEvents.createdAt)]
      default: return [desc(accessEvents.createdAt)]
    }
  })()

  const rows = await db.select()
    .from(accessEvents)
    .where(conditions.length ? and(...conditions) : undefined)
    .orderBy(...orderBy)
    .limit(limit)

  return rows.map(r => ({
    id: r.id,
    eventType: r.eventType,
    outcome: r.outcome,
    blockReason: (r.blockReason as AccessBlockReason | null) ?? null,
    ipAddress: r.ipAddress,
    userId: r.userId,
    userName: r.userName,
    userEmail: r.userEmail,
    path: r.path,
    userAgent: r.userAgent,
    deviceId: r.deviceId,
    os: r.os,
    deviceType: r.deviceType,
    screenResolution: r.screenResolution,
    devicePixelRatio: r.devicePixelRatio,
    cpuCores: r.cpuCores,
    deviceMemoryGb: r.deviceMemoryGb,
    gpuRenderer: r.gpuRenderer,
    canvasFingerprint: r.canvasFingerprint,
    webglFingerprint: r.webglFingerprint,
    audioFingerprint: r.audioFingerprint,
    timezone: r.timezone,
    language: r.language,
    maxTouchPoints: r.maxTouchPoints,
    latitude: r.latitude,
    longitude: r.longitude,
    locationLabel: r.locationLabel,
    country: r.country,
    createdAt: r.createdAt.toISOString(),
  }))
}

/** Whether geofence mode is active (enabled + geo/both + polygon). */
export function isAccessGateGeoActive(settings: AccessGateSettings): boolean {
  if (!settings.enabled) return false
  if (settings.blockMode !== 'geo' && settings.blockMode !== 'both') return false
  return settings.allowedPolygon.length >= 3
}

/** Whether any blocking mode is active. */
export function isAccessGateEnforcing(settings: AccessGateSettings): boolean {
  return settings.enabled && settings.blockMode !== 'off'
}

/** Best-effort retention: drop events older than the given number of days. */
export async function pruneAccessEvents(db: Db, keepDays = 30): Promise<void> {
  const cutoff = new Date(Date.now() - keepDays * 24 * 60 * 60 * 1000)
  await db.delete(accessEvents).where(lt(accessEvents.createdAt, cutoff))
}
