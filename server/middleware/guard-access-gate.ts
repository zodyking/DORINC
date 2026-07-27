import { getHeader, getRequestURL, sendRedirect } from 'h3'
import { getClientIp } from '../utils/client-ip'
import { hasDatabaseConfig } from '../services/runtime-config.service'
import { hasDatabaseConfigured, useDb } from '../db/client'
import {
  evaluateAccessDecision,
  getCachedAccessGateSettings,
  recordAccessEvent,
} from '../services/access-gate.service'
import { peekIpGeo, resolveIpGeo, resolveIpLocation } from '../services/ip-geolocation.service'
import { resolveSession } from '../auth/auth.service'
import { getSessionCookie } from '../auth/session-cookie'
import { hasValidOutsideGeoBypass } from '../auth/outside-geo-bypass'
import {
  findKnownOutsideGeoIdentity,
  quietlyIssueOutsideGeoChallenge,
} from '../services/outside-geo-verify.service'

/** Paths that must always stay reachable so admins can never be locked out. */
const EXEMPT_PREFIXES = ['/api/', '/_nuxt/', '/setup', '/__nuxt', '/favicon']
/** Internal gate pages — never bounce these through the gate again. */
const GATE_PAGES = [
  '/auth/verify-location',
  '/auth/access-restricted',
]
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
  if (EXEMPT_PREFIXES.some(prefix => path.startsWith(prefix))) return false
  if (ASSET_EXT.test(path)) return false
  const accept = getHeader(event, 'accept') ?? ''
  return accept.includes('text/html')
}

function isGatePage(path: string): boolean {
  return GATE_PAGES.some(prefix => path === prefix || path.startsWith(`${prefix}/`))
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
  const effectivelyBlocked = decision.blocked && !outsideGeoBypass && !isGatePage(path)

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

  // Outside geofence → internal pages only (no external redirect links).
  if (decision.reason === 'geo_outside') {
    try {
      const known = await findKnownOutsideGeoIdentity(useDb(), { ipAddress: ip, userAgent })
      if (known) {
        if (shouldIssueChallenge(ip ?? userAgent ?? 'unknown')) {
          const locationLabel = cachedGeo?.label
            ?? (ip ? await resolveIpLocation(ip).catch(() => null) : null)
          await quietlyIssueOutsideGeoChallenge(useDb(), {
            ipAddress: ip,
            userAgent,
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
