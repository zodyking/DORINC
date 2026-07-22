import { getHeader } from 'h3'
import { getClientIp } from '../../utils/client-ip'
import { AuthError, login, logout } from '../../auth/auth.service'
import { createPendingLoginToken } from '../../auth/pending-login'
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
import { apiError } from '../../utils/api-error'
import { rateLimitKeyFromIp, requireRateLimit } from '../../utils/require-rate-limit'
import { validateBody } from '../../utils/validate'
import { loginBodySchema } from '../../../shared/validators/auth'

export default defineEventHandler(async (event) => {
  await requireRateLimit(event, 'login', rateLimitKeyFromIp(event))
  const body = await validateBody(event, loginBodySchema)
  const identifier = body.portal === 'customer' ? body.username : body.email
  const ipAddress = getClientIp(event)

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
      userAgent: getHeader(event, 'user-agent'),
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

    // Access gate: block non-super-admin logins from banned IPs / outside the
    // allowed geofence. Super admins are always exempt to prevent lockout.
    const gate = getCachedAccessGateSettings()
    if (gate.enabled && result.accountTypeKey !== 'super_admin') {
      const decision = evaluateAccessDecision(gate, { ip: ipAddress, coords: loginCoords }, { strictGeo: false })
      if (decision.blocked) {
        await logout(useDb(), result.sessionToken).catch(() => {})
        await recordAccessEvent(useDb(), {
          eventType: 'login',
          outcome: 'blocked',
          ipAddress,
          userId: result.user.id,
          userName: result.user.name,
          userEmail: result.user.email,
          userAgent: getHeader(event, 'user-agent'),
          latitude: loginCoords?.lat ?? null,
          longitude: loginCoords?.lng ?? null,
          locationLabel,
          country: loginCountry,
        }).catch(() => {})
        throw apiError(event, 'FORBIDDEN', 'Access from your location is restricted', {
          reason: 'access_blocked',
          redirectUrl: gate.redirectUrl || null,
        })
      }
    }

    // Staff (except super admin) complete sign-in after granting device location.
    if (body.portal === 'staff' && result.accountTypeKey !== 'super_admin' && !body.geo) {
      return {
        needsLocation: true,
        loginToken: createPendingLoginToken(result.sessionToken),
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
      userAgent: getHeader(event, 'user-agent'),
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
          action: 'auth.login',
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
          portal: body.portal,
          ipAddress,
          userAgent: getHeader(event, 'user-agent'),
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
          action: 'portal.login',
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
          portal: body.portal,
          ipAddress,
          userAgent: getHeader(event, 'user-agent'),
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
          action: 'auth.login',
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
        nonCustomerEmailEnabled: result.user.nonCustomerEmailEnabled,
      },
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
          userAgent: getHeader(event, 'user-agent'),
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
          throw apiError(event, 'FORBIDDEN', 'Your temporary password has expired — ask staff to resend portal credentials', { reason: 'temp_password_expired' })
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
