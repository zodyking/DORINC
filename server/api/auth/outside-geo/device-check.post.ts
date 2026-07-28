import { getHeader } from 'h3'
import { getClientIp } from '../../../utils/client-ip'
import { useDb } from '../../../db/client'
import {
  evaluateAccessDecision,
  getCachedAccessGateSettings,
} from '../../../services/access-gate.service'
import { resolveIpGeo, resolveIpLocation } from '../../../services/ip-geolocation.service'
import {
  findKnownOutsideGeoIdentity,
  quietlyIssueOutsideGeoChallenge,
} from '../../../services/outside-geo-verify.service'
import { hasValidOutsideGeoBypass } from '../../../auth/outside-geo-bypass'
import { RateLimitError, consumeRateLimit } from '../../../services/rate-limit.service'
import { rateLimitKeyFromIp } from '../../../utils/require-rate-limit'
import { validateBody } from '../../../utils/validate'
import { outsideGeoDeviceCheckBodySchema } from '../../../../shared/validators/auth'

/**
 * Browser-GPS (or IP fallback) gate check.
 * Returns only `{ redirect }` — no identity / scope details for the console.
 */
export default defineEventHandler(async (event) => {
  try {
    await consumeRateLimit(useDb(), 'outside_geo', rateLimitKeyFromIp(event, 'device-check'))
  }
  catch (err) {
    if (err instanceof RateLimitError) {
      return { redirect: '/auth/access-restricted' }
    }
    return { redirect: '/auth/access-restricted' }
  }

  const body = await validateBody(event, outsideGeoDeviceCheckBodySchema)
  const ipAddress = getClientIp(event)
  const userAgent = getHeader(event, 'user-agent') ?? null
  const gate = getCachedAccessGateSettings()

  const checksGeo = gate.blockMode === 'geo' || gate.blockMode === 'both'
  const geoActive = gate.enabled && checksGeo && gate.allowedPolygon.length >= 3
  if (!geoActive) {
    return { redirect: null }
  }

  if (hasValidOutsideGeoBypass(event, { ipAddress, userAgent })) {
    return { redirect: null }
  }

  let coords: { lat: number, lng: number } | null = null
  if (body.latitude != null && body.longitude != null) {
    coords = { lat: body.latitude, lng: body.longitude }
  }
  else if (ipAddress) {
    const geo = await resolveIpGeo(ipAddress)
    if (geo?.latitude != null && geo?.longitude != null) {
      coords = { lat: geo.latitude, lng: geo.longitude }
    }
  }

  const decision = evaluateAccessDecision(gate, { ip: ipAddress, coords })
  if (!decision.blocked) {
    return { redirect: null }
  }

  if (decision.reason === 'geo_outside') {
    const known = await findKnownOutsideGeoIdentity(useDb(), { ipAddress, userAgent }).catch(() => null)
    if (known) {
      const ipGeo = ipAddress ? await resolveIpGeo(ipAddress).catch(() => null) : null
      const locationLabel = ipGeo?.label
        ?? (ipAddress ? await resolveIpLocation(ipAddress).catch(() => null) : null)
      await quietlyIssueOutsideGeoChallenge(useDb(), {
        ipAddress,
        userAgent,
        locationLabel,
      })
      return { redirect: '/auth/verify-location?sent=1' }
    }
  }

  return { redirect: '/auth/access-restricted' }
})
