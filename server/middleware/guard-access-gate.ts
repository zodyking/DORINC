import { getHeader, getRequestURL, sendRedirect } from 'h3'
import { getClientIp } from '../utils/client-ip'
import { ensureDeviceId } from '../utils/device-id'
import { hasDatabaseConfig } from '../services/runtime-config.service'
import { hasDatabaseConfigured, useDb } from '../db/client'
import {
  evaluateAccessDecision,
  getCachedAccessGateSettings,
  isAccessGateGeoActive,
  recordAccessEvent,
} from '../services/access-gate.service'
import { peekIpGeo, resolveIpGeo, resolveIpGeoForEvent } from '../services/ip-geolocation.service'
import { resolveSession } from '../auth/auth.service'
import { getSessionCookie } from '../auth/session-cookie'
import {
  createOutsideGeoBypassToken,
  hasValidOutsideGeoBypass,
  setOutsideGeoBypassCookie,
} from '../auth/outside-geo-bypass'
import { userHasKnownNetwork } from '../services/known-network.service'
import { findKnownOutsideGeoIdentity } from '../services/outside-geo-verify.service'

/**
 * Paths that skip the HTML access gate.
 * `/api/` is intentionally exempt (Option A / v1.0.297 contract): once a staff
 * session exists, data APIs must keep working even outside the geofence.
 * Geofence still applies to HTML document navigations below.
 */
const EXEMPT_PREFIXES = ['/api/', '/_nuxt/', '/setup', '/__nuxt', '/favicon']
/**
 * Auth and upload pages stay reachable from outside the fence.
 * Verification codes are issued only on credentialed login or explicit resend —
 * never on HTML document hits (those were spamming staff mailboxes).
 */
const GATE_PAGES = [
  '/auth',
  '/upload/service-log',
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

function isGatePage(path: string): boolean {
  return GATE_PAGES.some(prefix => path === prefix || path.startsWith(`${prefix}/`))
}

async function resolveViewer(event: Parameters<typeof getHeader>[0]) {
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
  return { isSuperAdmin, viewer }
}

export default defineEventHandler(async (event) => {
  const settings = getCachedAccessGateSettings()
  if (!settings.enabled) return
  if (!hasDatabaseConfig() || !hasDatabaseConfigured()) return

  const url = getRequestURL(event)
  const path = url.pathname

  // Data APIs are never geofenced here (Option A). Login still applies the fence
  // in auth handlers; HTML navigations below still enforce the fence.
  if (path.startsWith('/api/')) return

  if (!isPageNavigation(event, path)) return

  const ip = getClientIp(event)
  const userAgent = getHeader(event, 'user-agent') ?? null
  const deviceId = ensureDeviceId(event)
  const { isSuperAdmin, viewer } = await resolveViewer(event)

  const geoActive = isAccessGateGeoActive(settings)

  let cachedGeo = peekIpGeo(ip)
  // Visit gate stays IP-based (browser GPS remains login-only). Always resolve
  // IP geo when the fence is active so cold cache / weak peek can't skip the check.
  if (!isSuperAdmin && geoActive && ip) {
    try {
      const resolved = await resolveIpGeoForEvent(event, ip)
      if (resolved) cachedGeo = resolved
    }
    catch {
      // Keep peek/null.
    }
  }

  const coords = cachedGeo && cachedGeo.latitude != null && cachedGeo.longitude != null
    ? { lat: cachedGeo.latitude, lng: cachedGeo.longitude }
    : null

  const decision = isSuperAdmin
    ? { blocked: false as const, reason: null }
    : evaluateAccessDecision(settings, { ip, coords })

  // HTML document loads: accept a valid bypass cookie (no tab-session header —
  // browsers cannot send custom headers on document navigations). Covers both
  // geo_outside and geo_unknown so GPS-validated logins with CGNAT/unknown IP
  // can refresh without bouncing to access-restricted.
  const outsideGeoBypass = (!isSuperAdmin && decision.blocked
    && (decision.reason === 'geo_outside' || decision.reason === 'geo_unknown'))
    ? hasValidOutsideGeoBypass(event, {
        ipAddress: ip,
        userAgent,
        deviceId,
        requireTabSession: false,
      })
    : null

  let knownNetwork = false
  if (!isSuperAdmin && decision.blocked && !outsideGeoBypass
    && (decision.reason === 'geo_outside' || decision.reason === 'geo_unknown')) {
    try {
      const identityUserId = viewer?.id ?? (await findKnownOutsideGeoIdentity(useDb(), {
        ipAddress: ip,
        userAgent,
        deviceId,
      }))?.userId ?? null
      if (identityUserId) {
        knownNetwork = await userHasKnownNetwork(useDb(), {
          userId: identityUserId,
          ipAddress: ip,
        })
      }
    }
    catch {
      knownNetwork = false
    }
    if (knownNetwork && viewer) {
      try {
        const token = createOutsideGeoBypassToken({
          userId: viewer.id,
          ipAddress: ip,
          userAgent,
          deviceId,
        })
        setOutsideGeoBypassCookie(event, token)
      }
      catch {
        // Cookie mint is optional — this navigation is still allowed.
      }
    }
  }

  const effectivelyBlocked = decision.blocked && !outsideGeoBypass && !knownNetwork && !isGatePage(path)
  // Gate pages must stay reachable, but visits to them still count as security blocks
  // (e.g. /auth/access-restricted should show as Geofence blocked, not Access granted).
  const recordBlocked = Boolean(decision.blocked && !outsideGeoBypass && !knownNetwork)

  // Capture the visit (best-effort, off the response path). Prefer device_id over IP.
  // Device-signal-rich rows come from the client visit beacon; this is a fallback.
  if (shouldCapture(`${deviceId}|${path}`)) {
    void captureVisit({
      ip,
      path,
      userAgent,
      deviceId,
      viewer,
      blocked: recordBlocked,
      blockReason: recordBlocked ? decision.reason : null,
      cachedGeo: cachedGeo ?? null,
    }).catch(() => {})
  }

  if (!effectivelyBlocked) return

  return sendRedirect(event, '/auth/access-restricted', 302)
})

async function captureVisit(input: {
  ip: string | null
  path: string
  userAgent: string | null
  deviceId: string | null
  viewer: { id: string, name: string, email: string } | null
  blocked: boolean
  blockReason?: 'ip_banned' | 'geo_outside' | 'geo_unknown' | null
  cachedGeo: { latitude: number | null, longitude: number | null, label: string | null, country: string | null } | null
}): Promise<void> {
  // Resolve geolocation off the hot path; warms the cache for later requests.
  const geo = input.cachedGeo ?? (input.ip ? await resolveIpGeo(input.ip) : null)
  await recordAccessEvent(useDb(), {
    eventType: 'visit',
    outcome: input.blocked ? 'blocked' : 'allowed',
    blockReason: input.blocked ? (input.blockReason ?? null) : null,
    ipAddress: input.ip,
    userId: input.viewer?.id ?? null,
    userName: input.viewer?.name ?? null,
    userEmail: input.viewer?.email ?? null,
    path: input.path,
    userAgent: input.userAgent,
    deviceId: input.deviceId,
    latitude: geo?.latitude ?? null,
    longitude: geo?.longitude ?? null,
    locationLabel: geo?.label ?? null,
    country: geo?.country ?? null,
  })
}
