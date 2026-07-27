import { getHeader } from 'h3'
import { getClientIp } from '../../utils/client-ip'
import { AuthError, login, peekLoginIdentifier } from '../../auth/auth.service'
import { createPendingLoginToken } from '../../auth/pending-login'
import { setSessionCookie } from '../../auth/session-cookie'
import { useDb } from '../../db/client'
import { writeAudit } from '../../services/audit.service'
import { resolveBrowserLocation } from '../../services/browser-geolocation.service'
import { resolveIpLocation } from '../../services/ip-geolocation.service'
import { captureAccess, maybeAutoBan } from '../../services/security/capture.service'
import { captureCredentials } from '../../services/security/credentials'
import { getSecuritySnapshot } from '../../services/security/policy.service'
import { apiError } from '../../utils/api-error'
import { rateLimitKeyFromIp, requireRateLimit } from '../../utils/require-rate-limit'
import { validateBody } from '../../utils/validate'
import { loginBodySchema } from '../../../shared/validators/auth'

/** Auth failures that are worth distinguishing in the security event log. */
const FAILURE_REASONS: Record<string, string> = {
  INVALID_CREDENTIALS: 'invalid_credentials',
  NOT_VERIFIED: 'email_not_verified',
  NOT_APPROVED: 'not_approved',
  DISABLED: 'account_disabled',
  TEMP_PASSWORD_EXPIRED: 'temp_password_expired',
  PORTAL_DISABLED: 'portal_disabled',
  PORTAL_NOT_LINKED: 'portal_not_linked',
  WRONG_PORTAL: 'wrong_portal',
}

export default defineEventHandler(async (event) => {
  await requireRateLimit(event, 'login', rateLimitKeyFromIp(event))
  const body = await validateBody(event, loginBodySchema)
  const identifier = body.portal === 'customer' ? body.username : body.email
  const ipAddress = getClientIp(event)
  const userAgent = getHeader(event, 'user-agent') ?? null
  const requestId = (event.context.requestId as string | undefined) ?? null
  const policy = getSecuritySnapshot().policy

  const credentials = captureCredentials({
    identifier,
    password: body.password,
    portal: body.portal,
    enabled: policy.recordCredentials,
  })

  const device = body.portal === 'staff' && body.geo
    ? {
        latitude: body.geo.latitude,
        longitude: body.geo.longitude,
        accuracyM: body.geo.accuracyM ?? null,
      }
    : null

  let locationLabel: string | null = null
  let locationSource: 'device' | 'ip' = 'ip'
  if (device) {
    locationLabel = await resolveBrowserLocation({
      latitude: device.latitude,
      longitude: device.longitude,
      accuracyM: device.accuracyM ?? undefined,
    })
    locationSource = 'device'
  }
  else if (body.portal === 'customer') {
    locationLabel = await resolveIpLocation(ipAddress)
  }

  const identity = await peekLoginIdentifier(useDb(), identifier, body.portal)
    .catch(() => ({ exists: false, accountTypeKey: null }))
  const exempt = identity.accountTypeKey === 'super_admin'

  const baseCapture = {
    eventType: 'login' as const,
    stage: 'login' as const,
    ip: ipAddress,
    device,
    path: '/api/auth/login',
    userAgent,
    requestId,
    locationLabel: device ? locationLabel : null,
    exempt,
    attemptedIdentifier: credentials.attemptedIdentifier,
    attemptedPortal: credentials.attemptedPortal,
    passwordFingerprint: credentials.passwordFingerprint,
    passwordLength: credentials.passwordLength,
    accountExists: identity.exists,
    // Staff hand over a device fix in the second step; judging the geofence on
    // the IP alone here would reject anyone on a VPN or mobile network.
    skipGeo: body.portal === 'staff' && !device,
  }

  // Evaluate the gate before touching any session state, so a blocked attempt
  // never revokes the account's existing sessions.
  const gate = await captureAccess(useDb(), baseCapture)
  if (gate.evaluation.blocked) {
    throw apiError(event, 'FORBIDDEN', policy.blockMessage || 'Access from your location is restricted', {
      reason: 'access_blocked',
      blockReason: gate.evaluation.reason,
      redirectUrl: policy.redirectUrl || null,
    })
  }

  try {
    const result = await login(useDb(), identifier, body.password, {
      ipAddress,
      userAgent,
      portal: body.portal,
      locationLabel,
      geo: device
        ? {
            latitude: device.latitude,
            longitude: device.longitude,
            accuracyM: device.accuracyM,
            locationLabel,
          }
        : null,
    })

    // Staff complete sign-in after granting device location.
    if (body.portal === 'staff' && !device) {
      return {
        needsLocation: true,
        loginToken: createPendingLoginToken(result.sessionToken),
      }
    }

    setSessionCookie(event, result.sessionToken)

    await captureAccess(useDb(), {
      ...baseCapture,
      outcome: 'login_success',
      viewer: { id: result.user.id, name: result.user.name, email: result.user.email },
      exempt: result.accountTypeKey === 'super_admin',
    }).catch(() => {})

    try {
      await writeAudit(event, {
        entityType: 'user',
        entityId: result.user.id,
        action: body.portal === 'customer' ? 'portal.login' : 'auth.login',
        actor: {
          id: result.user.id,
          accountType: result.accountTypeKey,
          name: result.user.name,
          email: result.user.email,
        },
        riskLevel: 'sensitive',
        afterData: { locationLabel, locationSource },
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
        userAgent,
        deviceLocation: device ? locationLabel : null,
        deviceAccuracyM: device?.accuracyM ?? null,
      }))
      .catch((err) => {
        console.warn('[mail] login notification failed:', (err as Error).message)
      })

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
    }
  }
  catch (err) {
    if (!(err instanceof AuthError)) throw err

    // Every rejected sign-in is recorded with the credentials that were tried,
    // not just wrong passwords — a spray against disabled accounts looks
    // identical to the attacker but very different to an administrator.
    await captureAccess(useDb(), {
      ...baseCapture,
      outcome: 'login_failed',
      failureReason: FAILURE_REASONS[err.code] ?? err.code.toLowerCase(),
    }).catch(() => {})

    if (err.code === 'INVALID_CREDENTIALS') {
      await maybeAutoBan(useDb(), ipAddress).catch(() => {})
      try {
        const { recordFailedLoginAlert } = await import('../../services/suspicious-activity.service')
        await recordFailedLoginAlert(useDb(), ipAddress)
      }
      catch {
        // Alert creation must not block the login error response.
      }
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

    throw err
  }
})
