import { getHeader } from 'h3'
import { eq } from 'drizzle-orm'
import { getClientIp } from '../../utils/client-ip'
import { ensureDeviceId } from '../../utils/device-id'
import { logout, resolveSession } from '../../auth/auth.service'
import { verifyPendingLoginToken } from '../../auth/pending-login'
import {
  createOutsideGeoBypassToken,
  hasValidOutsideGeoBypass,
  setOutsideGeoBypassCookie,
} from '../../auth/outside-geo-bypass'
import { setSessionCookie } from '../../auth/session-cookie'
import { hashToken } from '../../auth/tokens'
import { useDb } from '../../db/client'
import { sessions } from '../../db/schema/auth'
import { writeAudit } from '../../services/audit.service'
import {
  evaluateAccessDecision,
  getCachedAccessGateSettings,
  isAccessGateGeoActive,
  recordAccessEvent,
} from '../../services/access-gate.service'
import { resolveBrowserLocation } from '../../services/browser-geolocation.service'
import { resolveIpGeo } from '../../services/ip-geolocation.service'
import {
  findKnownOutsideGeoIdentity,
  quietlyIssueOutsideGeoChallenge,
} from '../../services/outside-geo-verify.service'
import { apiError } from '../../utils/api-error'
import { rateLimitKeyFromIp, requireRateLimit } from '../../utils/require-rate-limit'
import { validateBody } from '../../utils/validate'
import { completeStaffLoginBodySchema } from '../../../shared/validators/auth'

export default defineEventHandler(async (event) => {
  await requireRateLimit(event, 'login', rateLimitKeyFromIp(event))
  const body = await validateBody(event, completeStaffLoginBodySchema)
  const ipAddress = getClientIp(event)
  const deviceId = ensureDeviceId(event)
  const userAgent = getHeader(event, 'user-agent')

  const sessionToken = verifyPendingLoginToken(body.loginToken)
  if (!sessionToken) {
    throw apiError(event, 'UNAUTHENTICATED', 'Sign-in session expired — please sign in again')
  }

  const resolved = await resolveSession(useDb(), sessionToken)
  if (!resolved) {
    throw apiError(event, 'UNAUTHENTICATED', 'Sign-in session expired — please sign in again')
  }

  const loginCoords = { lat: body.geo.latitude, lng: body.geo.longitude }
  const locationLabel = await resolveBrowserLocation({
    latitude: body.geo.latitude,
    longitude: body.geo.longitude,
    accuracyM: body.geo.accuracyM,
  })

  const gate = getCachedAccessGateSettings()
  let outsideGeofenceLogin = false
  if (gate.enabled && resolved.user.accountType !== 'super_admin') {
    const decision = evaluateAccessDecision(gate, { ip: ipAddress, coords: loginCoords })
    if (decision.blocked) {
      const bypass = decision.reason === 'geo_outside'
        ? hasValidOutsideGeoBypass(event, {
            ipAddress,
            userAgent,
            deviceId,
            userId: resolved.user.id,
          })
        : null
      if (bypass) {
        outsideGeofenceLogin = true
      }
      else {
        await logout(useDb(), sessionToken).catch(() => {})
        await recordAccessEvent(useDb(), {
          eventType: 'login',
          outcome: 'blocked',
          blockReason: decision.reason,
          ipAddress,
          userId: resolved.user.id,
          userName: resolved.user.name,
          userEmail: resolved.user.email,
          userAgent,
          deviceId,
          latitude: loginCoords.lat,
          longitude: loginCoords.lng,
          locationLabel,
        }).catch(() => {})

        let redirectTo = '/auth/access-restricted'
        if (decision.reason === 'geo_outside') {
          const known = await findKnownOutsideGeoIdentity(useDb(), {
            ipAddress,
            userAgent,
            deviceId,
          }).catch(() => null)
          if (known) {
            redirectTo = '/auth/verify-location?sent=1'
            void quietlyIssueOutsideGeoChallenge(useDb(), {
              ipAddress,
              userAgent,
              deviceId,
              locationLabel,
            }).catch(() => {})
          }
        }

        throw apiError(event, 'FORBIDDEN', 'Access from your location is restricted', {
          reason: 'access_blocked',
          redirectTo,
        })
      }
    }
  }

  setSessionCookie(event, sessionToken)

  // GPS already validated this login. If the *IP* looks outside/unknown (CGNAT,
  // travel, provider lag), mint a bypass so HTML refreshes are not bounced.
  if (gate.enabled && resolved.user.accountType !== 'super_admin') {
    try {
      let ipBlocked = false
      if (isAccessGateGeoActive(gate) && ipAddress) {
        const ipGeo = await resolveIpGeo(ipAddress)
        const ipCoords = ipGeo?.latitude != null && ipGeo?.longitude != null
          ? { lat: ipGeo.latitude, lng: ipGeo.longitude }
          : null
        const ipDecision = evaluateAccessDecision(gate, { ip: ipAddress, coords: ipCoords })
        ipBlocked = ipDecision.blocked
      }
      else {
        const ipDecision = evaluateAccessDecision(gate, { ip: ipAddress, coords: null })
        ipBlocked = ipDecision.blocked
      }
      if (ipBlocked || outsideGeofenceLogin) {
        const token = createOutsideGeoBypassToken({
          userId: resolved.user.id,
          ipAddress,
          userAgent,
          deviceId,
        })
        setOutsideGeoBypassCookie(event, token)
        outsideGeofenceLogin = true
      }
    }
    catch (err) {
      console.warn('[auth] complete-login bypass mint failed:', (err as Error).message)
    }
  }

  // Persist GPS onto the session created in step 1 (was missing before).
  await useDb().update(sessions).set({
    geoLatitude: body.geo.latitude,
    geoLongitude: body.geo.longitude,
    geoAccuracyM: body.geo.accuracyM ?? null,
    locationLabel,
    ...(deviceId ? { deviceId } : {}),
    ...(ipAddress ? { ipAddress } : {}),
    ...(userAgent ? { userAgent } : {}),
  }).where(eq(sessions.tokenHash, hashToken(sessionToken))).catch(() => {})

  await recordAccessEvent(useDb(), {
    eventType: 'login',
    outcome: 'login_success',
    ipAddress,
    userId: resolved.user.id,
    userName: resolved.user.name,
    userEmail: resolved.user.email,
    userAgent,
    deviceId,
    latitude: loginCoords.lat,
    longitude: loginCoords.lng,
    locationLabel,
  }).catch(() => {})

  try {
    await writeAudit(event, {
      entityType: 'user',
      entityId: resolved.user.id,
      action: outsideGeofenceLogin ? 'auth.login.outside_geofence' : 'auth.login',
      actor: {
        id: resolved.user.id,
        accountType: resolved.user.accountType,
        name: resolved.user.name,
        email: resolved.user.email,
      },
      riskLevel: 'sensitive',
      afterData: {
        locationLabel,
        locationSource: 'device',
        outsideGeofence: outsideGeofenceLogin,
        accessDecisionReason: outsideGeofenceLogin ? 'geo_outside' : null,
      },
    })
  }
  catch (err) {
    console.warn('[auth] complete-login audit failed:', (err as Error).message)
  }

  void import('../../services/login-notification.service')
    .then(({ sendLoginNotificationEmail }) => sendLoginNotificationEmail(useDb(), {
      to: resolved.user.email,
      name: resolved.user.name,
      userId: resolved.user.id,
      portal: 'staff',
      ipAddress,
      userAgent,
      deviceLocation: locationLabel,
      deviceAccuracyM: body.geo.accuracyM ?? null,
    }))
    .catch((err) => {
      console.warn('[mail] login notification failed:', (err as Error).message)
    })

  return {
    user: {
      id: resolved.user.id,
      name: resolved.user.name,
      email: resolved.user.email,
      username: resolved.user.username,
      accountType: resolved.user.accountType,
      customerId: resolved.user.customerId,
      mustChangePassword: resolved.user.mustChangePassword,
      nonCustomerEmailEnabled: resolved.user.nonCustomerEmailEnabled,
    },
    // Client must arm tab sessionStorage so non-/api/auth data APIs are not
    // 403'd by the access gate after an outside-geofence (or GPS) staff login.
    outsideGeofence: outsideGeofenceLogin,
    armOutsideGeoTabSession: true,
  }
})
