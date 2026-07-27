import { getHeader } from 'h3'
import { getClientIp } from '../../../utils/client-ip'
import { useDb } from '../../../db/client'
import {
  evaluateAccessDecision,
  getCachedAccessGateSettings,
} from '../../../services/access-gate.service'
import { resolveIpGeo, resolveIpLocation } from '../../../services/ip-geolocation.service'
import {
  enqueueOutsideGeoVerificationEmail,
  findKnownOutsideGeoIdentity,
  issueOutsideGeoChallenge,
} from '../../../services/outside-geo-verify.service'
import { hasValidOutsideGeoBypass } from '../../../auth/outside-geo-bypass'
import { apiError } from '../../../utils/api-error'
import { rateLimitKeyFromIp, requireRateLimit } from '../../../utils/require-rate-limit'

export default defineEventHandler(async (event) => {
  await requireRateLimit(event, 'outside_geo', rateLimitKeyFromIp(event, 'challenge'))

  const ipAddress = getClientIp(event)
  const userAgent = getHeader(event, 'user-agent') ?? null
  const gate = getCachedAccessGateSettings()

  if (!gate.enabled) {
    throw apiError(event, 'BAD_REQUEST', 'Location verification is not required right now')
  }

  if (hasValidOutsideGeoBypass(event, { ipAddress, userAgent })) {
    return {
      alreadyVerified: true,
      message: 'Your identity is already verified for this location. You can sign in.',
      redirectTo: '/auth/login',
    }
  }

  const geo = ipAddress ? await resolveIpGeo(ipAddress) : null
  const coords = geo?.latitude != null && geo?.longitude != null
    ? { lat: geo.latitude, lng: geo.longitude }
    : null
  const decision = evaluateAccessDecision(gate, { ip: ipAddress, coords }, { strictGeo: false })

  if (!decision.blocked || decision.reason !== 'geo_outside') {
    throw apiError(event, 'BAD_REQUEST', 'Location verification is only required outside the allowed area')
  }

  const identity = await findKnownOutsideGeoIdentity(useDb(), { ipAddress, userAgent })
  if (!identity) {
    throw apiError(event, 'FORBIDDEN', 'Access from your location is restricted', {
      reason: 'access_blocked',
      redirectUrl: gate.redirectUrl || null,
    })
  }

  const locationLabel = geo?.label ?? (ipAddress ? await resolveIpLocation(ipAddress) : null)
  const challenge = await issueOutsideGeoChallenge(useDb(), {
    identity,
    ipAddress,
    userAgent,
    locationLabel,
  })

  await enqueueOutsideGeoVerificationEmail(useDb(), {
    to: identity.userEmail,
    name: identity.userName,
    code: challenge.code,
    locationLabel,
    ipAddress,
  }).catch((err) => {
    console.warn('[mail] outside-geo verification email failed:', (err as Error).message)
  })

  return {
    alreadyVerified: false,
    challengeId: challenge.challengeId,
    maskedEmail: challenge.maskedEmail,
    message: `A 6-digit verification code was sent to ${challenge.maskedEmail}.`,
  }
})
