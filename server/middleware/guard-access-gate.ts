import { getHeader, getRequestURL, sendRedirect, setResponseStatus } from 'h3'
import { getClientIp } from '../utils/client-ip'
import { hasDatabaseConfig } from '../services/runtime-config.service'
import { hasDatabaseConfigured, useDb } from '../db/client'
import {
  evaluateAccessDecision,
  getCachedAccessGateSettings,
  recordAccessEvent,
} from '../services/access-gate.service'
import { peekIpGeo, resolveIpGeo } from '../services/ip-geolocation.service'
import { resolveSession } from '../auth/auth.service'
import { getSessionCookie } from '../auth/session-cookie'
import { hasValidOutsideGeoBypass } from '../auth/outside-geo-bypass'
import { findKnownOutsideGeoIdentity } from '../services/outside-geo-verify.service'

/** Paths that must always stay reachable so admins can never be locked out. */
const EXEMPT_PREFIXES = ['/api/', '/_nuxt/', '/setup', '/__nuxt', '/favicon']
/** Auth routes that must remain reachable during outside-geofence verification. */
const AUTH_ALWAYS_ALLOWED = [
  '/auth/verify-location',
]
const ASSET_EXT = /\.(?:js|mjs|css|map|png|jpe?g|gif|svg|webp|ico|woff2?|ttf|json|txt|xml|webmanifest)$/i

/** Throttle visit capture so a single client can't flood the table. */
const captureSeen = new Map<string, number>()
const CAPTURE_WINDOW_MS = 60_000
const CAPTURE_MAP_MAX = 20_000

function shouldCapture(key: string): boolean {
  const now = Date.now()
  const last = captureSeen.get(key)
  if (last && now - last < CAPTURE_WINDOW_MS) return false
  if (captureSeen.size >= CAPTURE_MAP_MAX) captureSeen.clear()
  captureSeen.set(key, now)
  return true
}

function isPageNavigation(event: Parameters<typeof getHeader>[0], path: string): boolean {
  if (event.method !== 'GET') return false
  if (EXEMPT_PREFIXES.some(prefix => path.startsWith(prefix))) return false
  if (ASSET_EXT.test(path)) return false
  const accept = getHeader(event, 'accept') ?? ''
  return accept.includes('text/html')
}

function isAuthAlwaysAllowed(path: string): boolean {
  return AUTH_ALWAYS_ALLOWED.some(prefix => path === prefix || path.startsWith(`${prefix}/`))
}

export default defineEventHandler(async (event) => {
  const settings = getCachedAccessGateSettings()
  if (!settings.enabled) return
  if (!hasDatabaseConfig() || !hasDatabaseConfigured()) return

  const url = getRequestURL(event)
  const path = url.pathname
  if (!isPageNavigation(event, path)) return

  const ip = getClientIp(event)
  const userAgent = getHeader(event, 'user-agent') ?? null

  // Resolve the viewer so super admins are never geo/IP blocked (anti-lockout).
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
    // Ignore — treat as anonymous visitor.
  }

  let cachedGeo = peekIpGeo(ip)
  let coords = cachedGeo && cachedGeo.latitude != null && cachedGeo.longitude != null
    ? { lat: cachedGeo.latitude, lng: cachedGeo.longitude }
    : null

  let decision = isSuperAdmin
    ? { blocked: false as const, reason: null }
    : evaluateAccessDecision(settings, { ip, coords })

  // On the blocked path only: if geo is unknown because the IP cache is cold,
  // resolve once so known travelers can reach identity verification on first hit.
  // Does not change evaluateAccessDecision itself.
  if (!isSuperAdmin && decision.blocked && decision.reason === 'geo_unknown' && ip) {
    try {
      const resolved = await resolveIpGeo(ip)
      if (resolved) {
        cachedGeo = resolved
        if (resolved.latitude != null && resolved.longitude != null) {
          coords = { lat: resolved.latitude, lng: resolved.longitude }
          decision = evaluateAccessDecision(settings, { ip, coords })
        }
      }
    }
    catch {
      // Keep the original geo_unknown decision.
    }
  }

  // Known users who already verified a suspicious-location challenge may proceed.
  const outsideGeoBypass = (!isSuperAdmin && decision.blocked && decision.reason === 'geo_outside')
    ? hasValidOutsideGeoBypass(event, { ipAddress: ip, userAgent })
    : null
  const effectivelyBlocked = decision.blocked && !outsideGeoBypass && !isAuthAlwaysAllowed(path)

  // Capture the visit (best-effort, off the response path).
  if (shouldCapture(`${ip ?? 'unknown'}|${path}`)) {
    void captureVisit({
      ip,
      path,
      userAgent,
      viewer,
      blocked: effectivelyBlocked,
      cachedGeo: cachedGeo ?? null,
    }).catch(() => {})
  }

  if (!effectivelyBlocked) return

  // Outside geofence + known IP/device/user → identity verification instead of hard block.
  if (decision.reason === 'geo_outside') {
    try {
      const known = await findKnownOutsideGeoIdentity(useDb(), { ipAddress: ip, userAgent })
      if (known) {
        return sendRedirect(event, '/auth/verify-location', 302)
      }
    }
    catch {
      // Fall through to the standard hard block if lookup fails.
    }
  }

  if (settings.redirectUrl) {
    return sendRedirect(event, settings.redirectUrl, 302)
  }
  setResponseStatus(event, 403)
  return 'Access to this site is restricted from your location.'
})

async function captureVisit(input: {
  ip: string | null
  path: string
  userAgent: string | null
  viewer: { id: string, name: string, email: string } | null
  blocked: boolean
  cachedGeo: { latitude: number | null, longitude: number | null, label: string | null, country: string | null } | null
}): Promise<void> {
  // Resolve geolocation off the hot path; warms the cache for later requests.
  const geo = input.cachedGeo ?? (input.ip ? await resolveIpGeo(input.ip) : null)
  await recordAccessEvent(useDb(), {
    eventType: 'visit',
    outcome: input.blocked ? 'blocked' : 'allowed',
    ipAddress: input.ip,
    userId: input.viewer?.id ?? null,
    userName: input.viewer?.name ?? null,
    userEmail: input.viewer?.email ?? null,
    path: input.path,
    userAgent: input.userAgent,
    latitude: geo?.latitude ?? null,
    longitude: geo?.longitude ?? null,
    locationLabel: geo?.label ?? null,
    country: geo?.country ?? null,
  })
}
