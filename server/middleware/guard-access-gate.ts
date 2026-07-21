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

/** Paths that must always stay reachable so admins can never be locked out. */
const EXEMPT_PREFIXES = ['/api/', '/_nuxt/', '/auth', '/setup', '/__nuxt', '/favicon']
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

  const cachedGeo = peekIpGeo(ip)
  const coords = cachedGeo && cachedGeo.latitude != null && cachedGeo.longitude != null
    ? { lat: cachedGeo.latitude, lng: cachedGeo.longitude }
    : null

  const decision = isSuperAdmin
    ? { blocked: false, reason: null }
    : evaluateAccessDecision(settings, { ip, coords })

  // Capture the visit (best-effort, off the response path).
  if (shouldCapture(`${ip ?? 'unknown'}|${path}`)) {
    void captureVisit({
      ip,
      path,
      userAgent,
      viewer,
      blocked: decision.blocked,
      cachedGeo: cachedGeo ?? null,
    }).catch(() => {})
  }

  if (decision.blocked) {
    if (settings.redirectUrl) {
      return sendRedirect(event, settings.redirectUrl, 302)
    }
    setResponseStatus(event, 403)
    return 'Access to this site is restricted from your location.'
  }
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
