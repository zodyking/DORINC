import { getHeader } from 'h3'
import { getClientIp } from '../../utils/client-ip'
import { logout, resolveSession } from '../../auth/auth.service'
import { verifyPendingLoginToken } from '../../auth/pending-login'
import { hasValidOutsideGeoBypass } from '../../auth/outside-geo-bypass'
import { setSessionCookie } from '../../auth/session-cookie'
import { useDb } from '../../db/client'
import { writeAudit } from '../../services/audit.service'
import { resolveBrowserLocation } from '../../services/browser-geolocation.service'
import {
  evaluateAccessDecision,
  getCachedAccessGateSettings,
  recordAccessEvent,
} from '../../services/access-gate.service'
import { apiError } from '../../utils/api-error'
import { rateLimitKeyFromIp, requireRateLimit } from '../../utils/require-rate-limit'
import { validateBody } from '../../utils/validate'
import { completeStaffLoginBodySchema } from '../../../shared/validators/auth'

export default defineEventHandler(async (event) => {
  await requireRateLimit(event, 'login', rateLimitKeyFromIp(event))
  const body = await validateBody(event, completeStaffLoginBodySchema)
  const ipAddress = getClientIp(event)

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
            userAgent: getHeader(event, 'user-agent'),
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
          ipAddress,
          userId: resolved.user.id,
          userName: resolved.user.name,
          userEmail: resolved.user.email,
          userAgent: getHeader(event, 'user-agent'),
          latitude: loginCoords.lat,
          longitude: loginCoords.lng,
          locationLabel,
        }).catch(() => {})
        throw apiError(event, 'FORBIDDEN', 'Access from your location is restricted', {
          reason: 'access_blocked',
          redirectUrl: gate.redirectUrl || null,
        })
      }
    }
  }

  setSessionCookie(event, sessionToken)

  await recordAccessEvent(useDb(), {
    eventType: 'login',
    outcome: 'login_success',
    ipAddress,
    userId: resolved.user.id,
    userName: resolved.user.name,
    userEmail: resolved.user.email,
    userAgent: getHeader(event, 'user-agent'),
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
      portal: 'staff',
      ipAddress,
      userAgent: getHeader(event, 'user-agent'),
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
  }
})
