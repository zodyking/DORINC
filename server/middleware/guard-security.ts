import { getHeader, getRequestURL, sendRedirect, setResponseHeader, setResponseStatus } from 'h3'
import type { H3Event } from 'h3'
import { getClientIp } from '../utils/client-ip'
import { hasDatabaseConfig } from '../services/runtime-config.service'
import { hasDatabaseConfigured, useDb } from '../db/client'
import { getSecuritySnapshot, scheduleSnapshotRefresh } from '../services/security/policy.service'
import { evaluateAccess } from '../services/security/evaluate'
import { captureAccess } from '../services/security/capture.service'
import { peekIpGeo } from '../services/ip-geolocation.service'
import { resolveSession } from '../auth/auth.service'
import { getSessionCookie } from '../auth/session-cookie'

/**
 * Paths that stay reachable no matter what, so a bad rule can never make the
 * app unrecoverable: the denied screen itself, sign-out, setup, and the check
 * endpoint the browser worker calls (it answers with a decision, not content).
 */
const ALWAYS_ALLOWED = [
  '/access-denied',
  '/setup',
  '/api/setup',
  '/api/auth/logout',
  '/api/security/check',
  '/api/health',
  '/_nuxt/',
  '/__nuxt',
  '/favicon',
]

const ASSET_EXT = /\.(?:js|mjs|css|map|png|jpe?g|gif|svg|webp|ico|woff2?|ttf|json|txt|xml|webmanifest)$/i

/** Throttle visit capture so a single client can't flood the event table. */
const captureSeen = new Map<string, number>()
const CAPTURE_MAP_MAX = 20_000

function shouldCapture(key: string, windowMs: number): boolean {
  if (windowMs <= 0) return true
  const now = Date.now()
  const last = captureSeen.get(key)
  if (last && now - last < windowMs) return false
  if (captureSeen.size >= CAPTURE_MAP_MAX) captureSeen.clear()
  captureSeen.set(key, now)
  return true
}

function isPageNavigation(event: H3Event, path: string): boolean {
  if (event.method !== 'GET') return false
  if (ASSET_EXT.test(path)) return false
  const accept = getHeader(event, 'accept') ?? ''
  return accept.includes('text/html')
}

async function resolveViewer(event: H3Event) {
  try {
    const token = getSessionCookie(event)
    if (!token) return null
    const resolved = await resolveSession(useDb(), token)
    if (!resolved) return null
    return {
      viewer: { id: resolved.user.id, name: resolved.user.name, email: resolved.user.email },
      isSuperAdmin: resolved.user.accountType === 'super_admin',
    }
  }
  catch {
    return null
  }
}

/**
 * Synchronous first line of defence.
 *
 * Only decisions that can be made from memory happen here — an IP ban match,
 * and a geofence check when this IP's location is already cached. Anything
 * needing a network lookup is left to /api/security/check, which the browser
 * worker calls on load. That split is deliberate: the previous implementation
 * blocked on a cache miss, which denied every genuine first-time visitor from
 * a new network.
 */
export default defineEventHandler(async (event) => {
  if (!hasDatabaseConfig() || !hasDatabaseConfigured()) return

  const snapshot = getSecuritySnapshot()
  if (!snapshot.policy.enabled) {
    // Still poll occasionally so switching the feature on takes effect without
    // a restart on every app instance.
    scheduleSnapshotRefresh(useDb())
    return
  }
  scheduleSnapshotRefresh(useDb())

  const url = getRequestURL(event)
  const path = url.pathname
  if (ALWAYS_ALLOWED.some(prefix => path.startsWith(prefix))) return

  const isApi = path.startsWith('/api/')
  const isPage = isPageNavigation(event, path)
  if (!isPage && !isApi) return
  if (isApi && !snapshot.policy.enforceOnApi) return

  const ip = getClientIp(event)
  const userAgent = getHeader(event, 'user-agent') ?? null

  const session = await resolveViewer(event)
  const isSuperAdmin = session?.isSuperAdmin ?? false

  const cachedGeo = peekIpGeo(ip)
  const coords = cachedGeo?.latitude != null && cachedGeo.longitude != null
    ? { lat: cachedGeo.latitude, lng: cachedGeo.longitude }
    : null

  const decision = evaluateAccess(snapshot, {
    ip,
    coords,
    geoSource: coords ? 'ip' : 'none',
    exempt: isSuperAdmin,
    // Without coordinates the browser check endpoint decides, after it has had
    // a chance to actually look the address up.
    deferUnknownGeo: !coords,
  })

  // A rule match earns a row on API calls too — otherwise a banned client
  // hammering /api/auth/login leaves no trace in the event feed. Both kinds of
  // traffic are throttled per client so nothing can flood the table; a
  // throttled hit still runs the capture, which keeps the ban and zone
  // counters exact, it just writes no row.
  const flagged = decision.blocked || decision.wouldBlock
  const throttleMs = snapshot.policy.captureThrottleSeconds * 1000
  const considered = flagged || (isPage && snapshot.policy.captureVisits)

  if (considered) {
    const key = flagged
      // Keyed on the decision rather than the path, so a bot probing a hundred
      // URLs produces one row per window instead of a hundred.
      ? `${ip ?? 'unknown'}|blocked|${decision.reason ?? ''}`
      : `${ip ?? 'unknown'}|${path}`

    // Off the response path: this resolves the IP over the network, which both
    // warms the cache for the next request and plots the event on the map.
    void captureAccess(useDb(), {
      eventType: 'visit',
      stage: isPage ? 'page_load' : 'api',
      ip,
      path,
      userAgent,
      requestId: event.context.requestId as string | undefined ?? null,
      viewer: session?.viewer ?? null,
      exempt: isSuperAdmin,
      recordEvent: shouldCapture(key, throttleMs),
    }).catch(() => {})
  }

  if (!decision.blocked) return

  if (isApi) {
    setResponseStatus(event, 403)
    setResponseHeader(event, 'content-type', 'application/json')
    return {
      code: 'FORBIDDEN',
      message: snapshot.policy.blockMessage,
      details: { reason: 'access_blocked', blockReason: decision.reason },
      requestId: (event.context.requestId as string | undefined) ?? '',
    }
  }

  if (snapshot.policy.redirectUrl) {
    return sendRedirect(event, snapshot.policy.redirectUrl, 302)
  }
  return sendRedirect(event, `/access-denied?reason=${decision.reason ?? 'blocked'}`, 302)
})
