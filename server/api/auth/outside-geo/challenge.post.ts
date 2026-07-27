import { getHeader, sendRedirect } from 'h3'
import { getClientIp } from '../../../utils/client-ip'
import { useDb } from '../../../db/client'
import {
  evaluateAccessDecision,
  getCachedAccessGateSettings,
} from '../../../services/access-gate.service'
import { resolveIpGeo, resolveIpLocation } from '../../../services/ip-geolocation.service'
import { quietlyIssueOutsideGeoChallenge } from '../../../services/outside-geo-verify.service'
import { hasValidOutsideGeoBypass } from '../../../auth/outside-geo-bypass'
import { RateLimitError, consumeRateLimit } from '../../../services/rate-limit.service'
import { rateLimitKeyFromIp } from '../../../utils/require-rate-limit'

/**
 * Issues (or re-issues) an outside-geofence code and always redirects back to
 * the verify page. Never returns identity / scope JSON to the browser.
 */
export default defineEventHandler(async (event) => {
  try {
    await consumeRateLimit(useDb(), 'outside_geo', rateLimitKeyFromIp(event, 'challenge'))
  }
  catch (err) {
    if (err instanceof RateLimitError) {
      return sendRedirect(event, '/auth/verify-location?err=1', 303)
    }
    return sendRedirect(event, '/auth/access-restricted', 303)
  }

  try {
    const ipAddress = getClientIp(event)
    const userAgent = getHeader(event, 'user-agent') ?? null
    const gate = getCachedAccessGateSettings()

    if (hasValidOutsideGeoBypass(event, { ipAddress, userAgent })) {
      return sendRedirect(event, '/auth/login', 303)
    }

    if (!gate.enabled) {
      return sendRedirect(event, '/auth/access-restricted', 303)
    }

    const geo = ipAddress ? await resolveIpGeo(ipAddress) : null
    const coords = geo?.latitude != null && geo?.longitude != null
      ? { lat: geo.latitude, lng: geo.longitude }
      : null
    const decision = evaluateAccessDecision(gate, { ip: ipAddress, coords }, { strictGeo: false })

    if (!decision.blocked || decision.reason !== 'geo_outside') {
      return sendRedirect(event, '/auth/access-restricted', 303)
    }

    const locationLabel = geo?.label ?? (ipAddress ? await resolveIpLocation(ipAddress) : null)
    const result = await quietlyIssueOutsideGeoChallenge(useDb(), {
      ipAddress,
      userAgent,
      locationLabel,
      force: true,
    })

    if (result === 'unknown' || result === 'failed') {
      return sendRedirect(event, '/auth/access-restricted', 303)
    }

    return sendRedirect(event, '/auth/verify-location?sent=1', 303)
  }
  catch {
    return sendRedirect(event, '/auth/access-restricted', 303)
  }
})
