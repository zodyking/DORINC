import { getHeader } from 'h3'
import { getClientIp } from '../../utils/client-ip'
import { ensureDeviceId } from '../../utils/device-id'
import { hasDatabaseConfig } from '../../services/runtime-config.service'
import { hasDatabaseConfigured, useDb } from '../../db/client'
import {
  evaluateAccessDecision,
  getCachedAccessGateSettings,
  isAccessGateEnforcing,
  isAccessGateGeoActive,
  recordAccessEvent,
} from '../../services/access-gate.service'
import { resolveIpGeoForEvent } from '../../services/ip-geolocation.service'
import { resolveSession } from '../../auth/auth.service'
import { getSessionCookie } from '../../auth/session-cookie'
import { hasValidOutsideGeoBypass } from '../../auth/outside-geo-bypass'
import { normalizeDeviceId } from '../../../shared/device-id'
import { visitBeaconBodySchema } from '../../../shared/validators/device-signals'
import { validateBody } from '../../utils/validate'
import { rateLimitKeyFromIp, requireRateLimit } from '../../utils/require-rate-limit'

const GATE_PAGES = [
  '/auth/verify-location',
  '/auth/access-restricted',
  '/auth/session-terminated',
  '/upload/service-log',
]

function isGatePage(path: string): boolean {
  return GATE_PAGES.some(prefix => path === prefix || path.startsWith(`${prefix}/`))
}

/**
 * Client beacon on every SPA/full visit while the access gate is enabled.
 * Records device signals for the security log. Does NOT bounce the SPA —
 * geofence redirects belong to HTML document loads only (Option A: after
 * sign-in, the workspace must keep working).
 */
export default defineEventHandler(async (event) => {
  await requireRateLimit(event, 'login', rateLimitKeyFromIp(event, 'visit-beacon'), {
    maxAttempts: 180,
    windowMs: 60_000,
  })

  const settings = getCachedAccessGateSettings()
  if (!settings.enabled || !hasDatabaseConfig() || !hasDatabaseConfigured()) {
    return { ok: true, blocked: false, redirectTo: null as string | null, captured: false }
  }

  const body = await validateBody(event, visitBeaconBodySchema)
  const ip = getClientIp(event)
  const headerUa = getHeader(event, 'user-agent') ?? null
  const cookieDeviceId = ensureDeviceId(event)
  const signalDeviceId = normalizeDeviceId(body.signals.deviceId)
  const deviceId = signalDeviceId ?? cookieDeviceId
  const userAgent = body.signals.userAgent?.trim() || headerUa

  let isSuperAdmin = false
  let viewer: { id: string, name: string, email: string } | null = null
  try {
    const token = getSessionCookie(event)
    if (token) {
      const resolved = await resolveSession(useDb(), token)
      if (resolved) {
        viewer = { id: resolved.user.id, name: resolved.user.name, email: resolved.user.email }
        isSuperAdmin = resolved.user.accountType === 'super_admin'
      }
    }
  }
  catch {
    // anonymous
  }

  let cachedGeo = null as Awaited<ReturnType<typeof resolveIpGeoForEvent>>
  if (!isSuperAdmin && isAccessGateGeoActive(settings) && ip) {
    try {
      cachedGeo = await resolveIpGeoForEvent(event, ip)
    }
    catch {
      cachedGeo = null
    }
  }
  else if (ip) {
    try {
      cachedGeo = await resolveIpGeoForEvent(event, ip)
    }
    catch {
      cachedGeo = null
    }
  }

  const coords = cachedGeo && cachedGeo.latitude != null && cachedGeo.longitude != null
    ? { lat: cachedGeo.latitude, lng: cachedGeo.longitude }
    : null

  const decision = isSuperAdmin
    ? { blocked: false as const, reason: null }
    : evaluateAccessDecision(settings, { ip, coords })

  const outsideGeoBypass = (!isSuperAdmin && decision.blocked && decision.reason === 'geo_outside')
    ? hasValidOutsideGeoBypass(event, {
        ipAddress: ip,
        userAgent,
        deviceId,
        requireTabSession: false,
      })
    : null

  const recordBlocked = Boolean(
    isAccessGateEnforcing(settings)
    && decision.blocked
    && !outsideGeoBypass
    && !isGatePage(body.path),
  )

  await recordAccessEvent(useDb(), {
    eventType: 'visit',
    outcome: recordBlocked ? 'blocked' : 'allowed',
    blockReason: recordBlocked ? (decision.reason ?? null) : null,
    ipAddress: ip,
    userId: viewer?.id ?? null,
    userName: viewer?.name ?? null,
    userEmail: viewer?.email ?? null,
    path: body.path,
    userAgent,
    deviceId,
    os: body.signals.os ?? null,
    deviceType: body.signals.deviceType ?? null,
    screenResolution: body.signals.screenResolution ?? null,
    devicePixelRatio: body.signals.devicePixelRatio ?? null,
    cpuCores: body.signals.cpuCores ?? null,
    deviceMemoryGb: body.signals.deviceMemoryGb ?? null,
    gpuRenderer: body.signals.gpuRenderer ?? null,
    canvasFingerprint: body.signals.canvasFingerprint ?? null,
    webglFingerprint: body.signals.webglFingerprint ?? null,
    audioFingerprint: body.signals.audioFingerprint ?? null,
    timezone: body.signals.timezone ?? null,
    language: body.signals.language ?? null,
    maxTouchPoints: body.signals.maxTouchPoints ?? null,
    latitude: cachedGeo?.latitude ?? null,
    longitude: cachedGeo?.longitude ?? null,
    locationLabel: cachedGeo?.label ?? null,
    country: cachedGeo?.country ?? null,
  }).catch(() => {})

  // Never instruct the SPA to navigate away — that undid Option A / GPS login.
  // HTML document middleware still enforces the fence on full page loads.
  return { ok: true, blocked: false, redirectTo: null as string | null, captured: true }
})
