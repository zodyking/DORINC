import { getHeader } from 'h3'
import { getClientIp } from '../../../utils/client-ip'
import { useDb } from '../../../db/client'
import {
  createOutsideGeoBypassToken,
  hasValidOutsideGeoBypass,
  setOutsideGeoBypassCookie,
} from '../../../auth/outside-geo-bypass'
import {
  evaluateAccessDecision,
  getCachedAccessGateSettings,
} from '../../../services/access-gate.service'
import { resolveIpGeo } from '../../../services/ip-geolocation.service'
import { verifyOutsideGeoCode } from '../../../services/outside-geo-verify.service'
import { apiError } from '../../../utils/api-error'
import { rateLimitKeyFromIp, requireRateLimit } from '../../../utils/require-rate-limit'
import { validateBody } from '../../../utils/validate'
import { outsideGeoVerifyBodySchema } from '../../../../shared/validators/auth'

export default defineEventHandler(async (event) => {
  await requireRateLimit(event, 'outside_geo', rateLimitKeyFromIp(event, 'verify'))
  const body = await validateBody(event, outsideGeoVerifyBodySchema)

  const ipAddress = getClientIp(event)
  const userAgent = getHeader(event, 'user-agent') ?? null

  if (hasValidOutsideGeoBypass(event, { ipAddress, userAgent })) {
    return {
      verified: true,
      message: 'Your identity is already verified for this location.',
      redirectTo: '/auth/login',
    }
  }

  const gate = getCachedAccessGateSettings()
  if (gate.enabled) {
    const geo = ipAddress ? await resolveIpGeo(ipAddress) : null
    const coords = geo?.latitude != null && geo?.longitude != null
      ? { lat: geo.latitude, lng: geo.longitude }
      : null
    const decision = evaluateAccessDecision(gate, { ip: ipAddress, coords }, { strictGeo: false })
    if (!decision.blocked || decision.reason !== 'geo_outside') {
      throw apiError(event, 'BAD_REQUEST', 'Location verification is only required outside the allowed area')
    }
  }

  const identity = await verifyOutsideGeoCode(useDb(), {
    code: body.code,
    ipAddress,
    userAgent,
  })
  if (!identity) {
    throw apiError(event, 'UNAUTHENTICATED', 'Invalid or expired verification code')
  }

  const token = createOutsideGeoBypassToken({
    userId: identity.userId,
    ipAddress,
    userAgent,
  })
  setOutsideGeoBypassCookie(event, token)

  return {
    verified: true,
    message: 'Identity verified. You can now sign in from this location.',
    redirectTo: '/auth/login',
  }
})
