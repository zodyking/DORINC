import { getHeader } from 'h3'
import { getClientIp } from '../../utils/client-ip'
import { hasDatabaseConfigured, useDb } from '../../db/client'
import { hasDatabaseConfig } from '../../services/runtime-config.service'
import { resolveSession } from '../../auth/auth.service'
import { getSessionCookie } from '../../auth/session-cookie'
import { captureAccess } from '../../services/security/capture.service'
import { needsCoordinates } from '../../services/security/evaluate'
import { getSecuritySnapshot, scheduleSnapshotRefresh } from '../../services/security/policy.service'
import { peekIpGeo } from '../../services/ip-geolocation.service'
import { validateBody } from '../../utils/validate'
import {
  securityCheckRequestSchema,
  type SecurityCheckResponse,
} from '../../../shared/validators/security-access'

/**
 * Per-IP throttle. A page load calls this once, so an in-memory guard is enough
 * and avoids writing a rate-limit row on every visit.
 */
const lastCheck = new Map<string, number>()
const CHECK_MIN_INTERVAL_MS = 5_000
const CHECK_MAP_MAX = 20_000

function throttled(key: string): boolean {
  const now = Date.now()
  const previous = lastCheck.get(key)
  if (previous && now - previous < CHECK_MIN_INTERVAL_MS) return true
  if (lastCheck.size >= CHECK_MAP_MAX) lastCheck.clear()
  lastCheck.set(key, now)
  return false
}

const ALLOW: SecurityCheckResponse = {
  blocked: false,
  reason: null,
  redirectUrl: null,
  message: '',
  needsDeviceLocation: false,
}

/**
 * Authoritative access check for a page load, called by the browser's security
 * worker so the IP geolocation lookup never blocks rendering. Unlike the
 * synchronous middleware this may hit the network, so it is the only place a
 * geofence decision is made for a location we have not seen before.
 */
export default defineEventHandler(async (event): Promise<SecurityCheckResponse> => {
  if (!hasDatabaseConfig() || !hasDatabaseConfigured()) return ALLOW

  const snapshot = getSecuritySnapshot()
  scheduleSnapshotRefresh(useDb())
  if (!snapshot.policy.enabled) return ALLOW

  const body = await validateBody(event, securityCheckRequestSchema)
  const ip = getClientIp(event)
  const userAgent = getHeader(event, 'user-agent') ?? null

  let viewer: { id: string, name: string, email: string } | null = null
  let isSuperAdmin = false
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
    // Anonymous visitor.
  }

  const device = body.device
    ? {
        latitude: body.device.latitude,
        longitude: body.device.longitude,
        accuracyM: body.device.accuracyM ?? null,
      }
    : null

  // A repeat call from the same client within the throttle window still needs a
  // decision, but must not re-log the visit or re-hit the geolocation provider.
  if (throttled(`${ip ?? 'unknown'}|${body.path}`) && !device) {
    const cached = peekIpGeo(ip)
    const coords = cached?.latitude != null && cached.longitude != null
      ? { lat: cached.latitude, lng: cached.longitude }
      : null
    return {
      ...ALLOW,
      needsDeviceLocation: needsCoordinates(snapshot, coords),
    }
  }

  const { evaluation } = await captureAccess(useDb(), {
    eventType: 'visit',
    stage: 'page_load',
    ip,
    device,
    path: body.path,
    userAgent,
    requestId: (event.context.requestId as string | undefined) ?? null,
    timezone: body.timezone ?? null,
    viewer,
    exempt: isSuperAdmin,
  })

  if (!evaluation.blocked) {
    return {
      ...ALLOW,
      // Ask the browser for GPS only when a zone exists and the IP could not be
      // placed — a device fix is the only way to finish the check.
      needsDeviceLocation: !device && needsCoordinates(snapshot, evaluation.usedCoords),
    }
  }

  return {
    blocked: true,
    reason: evaluation.reason,
    redirectUrl: snapshot.policy.redirectUrl || null,
    message: snapshot.policy.blockMessage,
    needsDeviceLocation: false,
  }
})
