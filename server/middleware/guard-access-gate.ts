import { getHeader, getRequestURL, sendRedirect } from 'h3'
import { getClientIp } from '../utils/client-ip'
import { ensureDeviceId } from '../utils/device-id'
import { hasDatabaseConfig } from '../services/runtime-config.service'
import { hasDatabaseConfigured, useDb } from '../db/client'
import {
  evaluateAccessDecision,
  getCachedAccessGateSettings,
  isAccessGateEnforcing,
  isAccessGateGeoActive,
  recordAccessEvent,
} from '../services/access-gate.service'
import { peekIpGeo, resolveIpGeo, resolveIpGeoForEvent, resolveIpLocation } from '../services/ip-geolocation.service'
import { resolveSession } from '../auth/auth.service'
import { getSessionCookie } from '../auth/session-cookie'
import { hasValidOutsideGeoBypass } from '../auth/outside-geo-bypass'
import {
  findKnownOutsideGeoIdentity,
  quietlyIssueOutsideGeoChallenge,
} from '../services/outside-geo-verify.service'
import { apiError } from '../utils/api-error'
import {
  OUTSIDE_GEO_SESSION_HEADER,
  isOutsideGeoSessionFlag,
} from '../../shared/outside-geo-session'

/** Paths that must always stay reachable so admins can never be locked out. */
const EXEMPT_PREFIXES = ['/_nuxt/', '/setup', '/__nuxt', '/favicon']
/** API routes that must remain reachable for login/challenge/beacon/public flows. */
const API_EXEMPT_PREFIXES = [
  '/api/security/visit-beacon',
  '/api/auth/',
  '/api/public/',
  '/api/setup/',
  '/api/health',
  '/api/internal/',
]
/** Internal gate pages — never bounce these through the gate again. */
const GATE_PAGES = [
  '/auth/verify-location',
  '/auth/access-restricted',
  '/upload/service-log',
]
/** Login may load with a fresh bypass cookie after verify (before tab session is armed). */
const LOGIN_PATHS = ['/auth/login', '/auth/portal-login']
const ASSET_EXT = /\.(?:js|mjs|css|map|png|jpe?g|gif|svg|webp|ico|woff2?|ttf|json|txt|xml|webmanifest)$/i

/** Throttle visit capture so a single client can't flood the table. */
const captureSeen = new Map<string, number>()
const CAPTURE_WINDOW_MS = 60_000
const CAPTURE_MAP_MAX = 20_000

/** Avoid re-issuing verification emails on every HTML navigation. */
const challengeIssued = new Map<string, number>()
const CHALLENGE_COOLDOWN_MS = 60_000

function shouldCapture(key: string): boolean {
  const now = Date.now()
  const last = captureSeen.get(key)
  if (last && now - last < CAPTURE_WINDOW_MS) return false
  if (captureSeen.size >= CAPTURE_MAP_MAX) captureSeen.clear()
  captureSeen.set(key, now)
  return true
}

function shouldIssueChallenge(key: string): boolean {
  const now = Date.now()
  const last = challengeIssued.get(key)
  if (last && now - last < CHALLENGE_COOLDOWN_MS) return false
  if (challengeIssued.size >= CAPTURE_MAP_MAX) challengeIssued.clear()
  challengeIssued.set(key, now)
  return true
}

function isPageNavigation(event: Parameters<typeof getHeader>[0], path: string): boolean {
  if (event.method !== 'GET') return false
  if (path.startsWith('/api/')) return false
  if (EXEMPT_PREFIXES.some(prefix => path.startsWith(prefix))) return false
  if (ASSET_EXT.test(path)) return false
  const accept = getHeader(event, 'accept') ?? ''
  return accept.includes('text/html')
}

function isApiRequest(path: string): boolean {
  return path.startsWith('/api/')
}

function isApiExempt(path: string): boolean {
  return API_EXEMPT_PREFIXES.some(prefix => path === prefix || path.startsWith(prefix))
}

function isGatePage(path: string): boolean {
  return GATE_PAGES.some(prefix => path === prefix || path.startsWith(`${prefix}/`))
}

function isLoginPage(path: string): boolean {
  return LOGIN_PATHS.some(prefix => path === prefix || path.startsWith(`${prefix}/`))
}

function tabSessionFromEvent(event: Parameters<typeof getHeader>[0]): boolean {
  return isOutsideGeoSessionFlag(getHeader(event, OUTSIDE_GEO_SESSION_HEADER))
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

  // API enforcement: close the SPA bypass so authenticated/app API calls
  // cannot continue after leaving the geofence.
  if (isApiRequest(path)) {
    if (!isAccessGateEnforcing(settings) || isApiExempt(path)) return

    const ip = getClientIp(event)
    const userAgent = getHeader(event, 'user-agent') ?? null
    const deviceId = ensureDeviceId(event)
    const { isSuperAdmin } = await resolveViewer(event)
    if (isSuperAdmin) return

    let cachedGeo = peekIpGeo(ip)
    if (isAccessGateGeoActive(settings) && ip) {
      try {
        const resolved = await resolveIpGeoForEvent(event, ip)
        if (resolved) cachedGeo = resolved
      }
      catch {
        // keep peek/null — fail closed below when coords missing
      }
    }

    const coords = cachedGeo && cachedGeo.latitude != null && cachedGeo.longitude != null
      ? { lat: cachedGeo.latitude, lng: cachedGeo.longitude }
      : null

    const decision = evaluateAccessDecision(settings, { ip, coords })
    if (!decision.blocked) return

    // API: cookie alone is not enough — tab session header required (new tab = re-verify).
    const outsideGeoBypass = decision.reason === 'geo_outside'
      ? hasValidOutsideGeoBypass(event, {
          ipAddress: ip,
          userAgent,
          deviceId,
          requireTabSession: true,
          tabSessionConfirmed: tabSessionFromEvent(event),
        })
      : null
    if (outsideGeoBypass) return

    let redirectTo = '/auth/access-restricted'
    if (decision.reason === 'geo_outside') {
      try {
        const known = await findKnownOutsideGeoIdentity(useDb(), {
          ipAddress: ip,
          userAgent,
          deviceId,
        })
        if (known) {
          if (shouldIssueChallenge(deviceId || ip || userAgent || 'unknown')) {
            const locationLabel = cachedGeo?.label
              ?? (ip ? await resolveIpLocation(ip).catch(() => null) : null)
            await quietlyIssueOutsideGeoChallenge(useDb(), {
              ipAddress: ip,
              userAgent,
              deviceId,
              locationLabel,
            })
          }
          redirectTo = '/auth/verify-location?sent=1'
        }
      }
      catch {
        // keep restricted
      }
    }

    throw apiError(event, 'FORBIDDEN', 'Access from your location is restricted', {
      reason: 'access_blocked',
      redirectTo,
    })
  }

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

  // HTML document loads: never trust the bypass cookie alone (new tabs would skip
  // the fence). Only login + gate pages may use the cookie without a tab session.
  // SPA browsing after verify relies on the visit beacon + tab sessionStorage.
  const tabSession = tabSessionFromEvent(event)
  const outsideGeoBypass = (!isSuperAdmin && decision.blocked && decision.reason === 'geo_outside')
    ? (
        isLoginPage(path)
          ? hasValidOutsideGeoBypass(event, { ipAddress: ip, userAgent, deviceId })
          : hasValidOutsideGeoBypass(event, {
              ipAddress: ip,
              userAgent,
              deviceId,
              requireTabSession: true,
              tabSessionConfirmed: tabSession,
            })
      )
    : null
  const effectivelyBlocked = decision.blocked && !outsideGeoBypass && !isGatePage(path)

  // Capture the visit (best-effort, off the response path). Prefer device_id over IP.
  // Device-signal-rich rows come from the client visit beacon; this is a fallback.
  if (shouldCapture(`${deviceId}|${path}`)) {
    void captureVisit({
      ip,
      path,
      userAgent,
      deviceId,
      viewer,
      blocked: Boolean(effectivelyBlocked),
      cachedGeo: cachedGeo ?? null,
    }).catch(() => {})
  }

  if (!effectivelyBlocked) return

  // Outside geofence → internal pages only (no external redirect links).
  if (decision.reason === 'geo_outside') {
    try {
      const known = await findKnownOutsideGeoIdentity(useDb(), { ipAddress: ip, userAgent, deviceId })
      if (known) {
        if (shouldIssueChallenge(deviceId || ip || userAgent || 'unknown')) {
          const locationLabel = cachedGeo?.label
            ?? (ip ? await resolveIpLocation(ip).catch(() => null) : null)
          await quietlyIssueOutsideGeoChallenge(useDb(), {
            ipAddress: ip,
            userAgent,
            deviceId,
            locationLabel,
          })
        }
        return sendRedirect(event, '/auth/verify-location?sent=1', 302)
      }
    }
    catch {
      // Fall through to the unknown-device restricted page.
    }
  }

  return sendRedirect(event, '/auth/access-restricted', 302)
})

async function captureVisit(input: {
  ip: string | null
  path: string
  userAgent: string | null
  deviceId: string | null
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
    deviceId: input.deviceId,
    latitude: geo?.latitude ?? null,
    longitude: geo?.longitude ?? null,
    locationLabel: geo?.label ?? null,
    country: geo?.country ?? null,
  })
}
