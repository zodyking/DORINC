import { getHeader } from 'h3'
import { getClientIp } from '../../utils/client-ip'
import { ensureDeviceId } from '../../utils/device-id'
import { AuthError, login, logout } from '../../auth/auth.service'
import { createPendingLoginToken } from '../../auth/pending-login'
import { hasValidOutsideGeoBypass } from '../../auth/outside-geo-bypass'
import { setSessionCookie } from '../../auth/session-cookie'
import { useDb } from '../../db/client'
import { writeAudit } from '../../services/audit.service'
import { resolveBrowserLocation } from '../../services/browser-geolocation.service'
import { resolveIpGeo, resolveIpLocation } from '../../services/ip-geolocation.service'
import {
  evaluateAccessDecision,
  getCachedAccessGateSettings,
  recordAccessEvent,
} from '../../services/access-gate.service'
import { resolveSessionSecret } from '../../services/app-config.service'
import {
  findKnownOutsideGeoIdentity,
  quietlyIssueOutsideGeoChallenge,
} from '../../services/outside-geo-verify.service'
import { apiError } from '../../utils/api-error'
import { rateLimitKeyFromIp, requireRateLimit } from '../../utils/require-rate-limit'
import { validateBody } from '../../utils/validate'
import { loginBodySchema } from '../../../shared/validators/auth'

export default defineEventHandler(async (event) => {
  await requireRateLimit(event, 'login', rateLimitKeyFromIp(event))
  const body = await validateBody(event, loginBodySchema)
  const identifier = body.portal === 'customer' ? body.username : body.email
  const ipAddress = getClientIp(event)
  const deviceId = ensureDeviceId(event)
  const userAgent = getHeader(event, 'user-agent')

  let locationLabel: string | null = null
  let locationSource: 'device' | 'ip' = 'ip'
  let loginCoords: { lat: number, lng: number } | null = null
  let loginCountry: string | null = null
  if (body.portal === 'staff' && body.geo) {
    locationLabel = await resolveBrowserLocation({
      latitude: body.geo.latitude,
      longitude: body.geo.longitude,
      accuracyM: body.geo.accuracyM,
    })
    locationSource = 'device'
    loginCoords = { lat: body.geo.latitude, lng: body.geo.longitude }
  }
  else if (body.portal === 'customer') {
    locationLabel = await resolveIpLocation(ipAddress)
    const geo = await resolveIpGeo(ipAddress)
    if (geo?.latitude != null && geo?.longitude != null) {
      loginCoords = { lat: geo.latitude, lng: geo.longitude }
    }
    loginCountry = geo?.country ?? null
  }

  try {
    const result = await login(useDb(), identifier, body.password, {
      ipAddress,
      userAgent,
      deviceId,
      portal: body.portal,
      locationLabel,
      geo: body.portal === 'staff' && body.geo
        ? {
            latitude: body.geo.latitude,
            longitude: body.geo.longitude,
            accuracyM: body.geo.accuracyM ?? null,
            locationLabel,
          }
        : null,
    })

    // Staff complete sign-in after granting device location. Defer geofence until
    // complete-login so GPS can be collected (fail closed there).
    if (body.portal === 'staff' && !body.geo) {
      const sessionSecret = await resolveSessionSecret(useDb())
      if (!sessionSecret) {
        console.error('[auth] staff login blocked: SESSION_SECRET is not configured')
        throw apiError(
          event,
          'SERVICE_UNAVAILABLE',
          'Server security is not configured. Set SESSION_SECRET in the environment or complete Security setup, then restart the app.',
        )
      }
      return {
        needsLocation: true,
        loginToken: createPendingLoginToken(result.sessionToken),
      }
    }

    // Access gate: block non-super-admin logins from banned IPs / outside the
    // allowed geofence. Super admins are always exempt to prevent lockout.
    // Geofence fails closed when coordinates are unknown (no more fail-open).
    // Known users who completed suspicious-location verification may sign in
    // outside the geofence with a short-lived bypass cookie.
    const gate = getCachedAccessGateSettings()
    let outsideGeofenceLogin = false
    if (gate.enabled && result.accountTypeKey !== 'super_admin') {
      const decision = evaluateAccessDecision(
        gate,
        { ip: ipAddress, coords: loginCoords },
      )
      if (decision.blocked) {
        const bypass = decision.reason === 'geo_outside'
          ? hasValidOutsideGeoBypass(event, {
              ipAddress,
              userAgent,
              deviceId,
              userId: result.user.id,
            })
          : null
        if (bypass) {
          outsideGeofenceLogin = true
        }
        else {
          await logout(useDb(), result.sessionToken).catch(() => {})
          await recordAccessEvent(useDb(), {
            eventType: 'login',
            outcome: 'blocked',
            blockReason: decision.reason,
            ipAddress,
            userId: result.user.id,
            userName: result.user.name,
            userEmail: result.user.email,
            userAgent,
            deviceId,
            latitude: loginCoords?.lat ?? null,
            longitude: loginCoords?.lng ?? null,
            locationLabel,
            country: loginCountry,
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

    setSessionCookie(event, result.sessionToken)

    await recordAccessEvent(useDb(), {
      eventType: 'login',
      outcome: 'login_success',
      ipAddress,
      userId: result.user.id,
      userName: result.user.name,
      userEmail: result.user.email,
      userAgent,
      deviceId,
      latitude: loginCoords?.lat ?? null,
      longitude: loginCoords?.lng ?? null,
      locationLabel,
      country: loginCountry,
    }).catch(() => {})

    if (body.portal === 'staff' && body.geo) {
      try {
        await writeAudit(event, {
          entityType: 'user',
          entityId: result.user.id,
          action: outsideGeofenceLogin ? 'auth.login.outside_geofence' : 'auth.login',
          actor: {
            id: result.user.id,
            accountType: result.accountTypeKey,
            name: result.user.name,
            email: result.user.email,
          },
          riskLevel: 'sensitive',
          afterData: {
            locationLabel,
            locationSource,
            outsideGeofence: outsideGeofenceLogin,
            accessDecisionReason: outsideGeofenceLogin ? 'geo_outside' : null,
          },
        })
      }
      catch (err) {
        console.warn('[auth] login audit failed:', (err as Error).message)
      }

      void import('../../services/login-notification.service')
        .then(({ sendLoginNotificationEmail }) => sendLoginNotificationEmail(useDb(), {
          to: result.user.email,
          name: result.user.name,
          userId: result.user.id,
          portal: body.portal,
          ipAddress,
          userAgent,
          deviceLocation: locationLabel,
          deviceAccuracyM: body.geo.accuracyM ?? null,
        }))
        .catch((err) => {
          console.warn('[mail] login notification failed:', (err as Error).message)
        })
    }
    else if (body.portal === 'customer') {
      try {
        await writeAudit(event, {
          entityType: 'user',
          entityId: result.user.id,
          action: outsideGeofenceLogin ? 'portal.login.outside_geofence' : 'portal.login',
          actor: {
            id: result.user.id,
            accountType: result.accountTypeKey,
            name: result.user.name,
            email: result.user.email,
          },
          riskLevel: 'sensitive',
          afterData: {
            locationLabel,
            locationSource,
            outsideGeofence: outsideGeofenceLogin,
            accessDecisionReason: outsideGeofenceLogin ? 'geo_outside' : null,
          },
        })
      }
      catch (err) {
        console.warn('[auth] login audit failed:', (err as Error).message)
      }

      void import('../../services/login-notification.service')
        .then(({ sendLoginNotificationEmail }) => sendLoginNotificationEmail(useDb(), {
          to: result.user.email,
          name: result.user.name,
          userId: result.user.id,
          portal: body.portal,
          ipAddress,
          userAgent,
          deviceLocation: null,
          deviceAccuracyM: null,
        }))
        .catch((err) => {
          console.warn('[mail] login notification failed:', (err as Error).message)
        })
    }
    else {
      try {
        await writeAudit(event, {
          entityType: 'user',
          entityId: result.user.id,
          action: outsideGeofenceLogin ? 'auth.login.outside_geofence' : 'auth.login',
          actor: {
            id: result.user.id,
            accountType: result.accountTypeKey,
            name: result.user.name,
            email: result.user.email,
          },
          riskLevel: 'sensitive',
          afterData: {
            locationLabel: null,
            locationSource: 'device',
            outsideGeofence: outsideGeofenceLogin,
            accessDecisionReason: outsideGeofenceLogin ? 'geo_outside' : null,
          },
        })
      }
      catch (err) {
        console.warn('[auth] login audit failed:', (err as Error).message)
      }
    }

    return {
      user: {
        id: result.user.id,
        name: result.user.name,
        email: result.user.email,
        username: result.user.username,
        accountType: result.accountTypeKey,
        customerId: result.user.customerId,
        mustChangePassword: result.user.mustChangePassword,
      },
      outsideGeofence: outsideGeofenceLogin,
      // Staff GPS login already validated this tab — arm API bypass header support.
      armOutsideGeoTabSession: body.portal === 'staff' && Boolean(body.geo),
    }
  }
  catch (err) {
    if (err instanceof AuthError) {
      if (err.code === 'INVALID_CREDENTIALS') {
        try {
          const { recordFailedLoginAlert } = await import('../../services/suspicious-activity.service')
          await recordFailedLoginAlert(
            useDb(),
            getClientIp(event),
          )
        }
        catch {
          // Alert creation must not block login error response
        }
        await recordAccessEvent(useDb(), {
          eventType: 'login',
          outcome: 'login_failed',
          ipAddress,
          userAgent,
          deviceId,
          latitude: loginCoords?.lat ?? null,
          longitude: loginCoords?.lng ?? null,
          locationLabel,
          country: loginCountry,
        }).catch(() => {})
        throw apiError(
          event,
          'UNAUTHENTICATED',
          body.portal === 'customer' ? 'Invalid username or password' : 'Invalid email or password',
        )
      }
      switch (err.code) {
        case 'NOT_VERIFIED':
          throw apiError(event, 'FORBIDDEN', 'Verify your email before signing in', {
            reason: 'not_verified',
            email: body.portal === 'staff' ? body.email : undefined,
          })
        case 'NOT_APPROVED':
          throw apiError(event, 'FORBIDDEN', 'Your account is awaiting admin approval', {
            reason: 'not_approved',
            email: body.portal === 'staff' ? body.email : undefined,
          })
        case 'DISABLED':
          throw apiError(event, 'FORBIDDEN', 'This account has been disabled', { reason: 'disabled' })
        case 'TEMP_PASSWORD_EXPIRED':
          throw apiError(
            event,
            'FORBIDDEN',
            body.portal === 'customer'
              ? 'Your temporary password has expired — ask staff to resend portal credentials'
              : 'Your temporary password has expired — ask an administrator to resend your invite',
            { reason: 'temp_password_expired' },
          )
        case 'PORTAL_DISABLED':
          throw apiError(event, 'FORBIDDEN', 'Portal access is not enabled for this account', { reason: 'portal_disabled' })
        case 'PORTAL_NOT_LINKED':
          throw apiError(event, 'FORBIDDEN', 'Portal account is not linked to a customer', { reason: 'portal_not_linked' })
        case 'WRONG_PORTAL':
          throw apiError(
            event,
            'FORBIDDEN',
            body.portal === 'customer'
              ? 'Use the staff portal to sign in'
              : 'Use the customer portal to sign in',
            { reason: 'wrong_portal' },
          )
      }
    }
    throw err
  }
})
