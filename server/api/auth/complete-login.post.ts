import { getHeader } from 'h3'
import { getClientIp } from '../../utils/client-ip'
import { logout, resolveSession } from '../../auth/auth.service'
import { verifyPendingLoginToken } from '../../auth/pending-login'
import { setSessionCookie } from '../../auth/session-cookie'
import { useDb } from '../../db/client'
import { writeAudit } from '../../services/audit.service'
import { resolveBrowserLocation } from '../../services/browser-geolocation.service'
import { captureAccess } from '../../services/security/capture.service'
import { getSecuritySnapshot } from '../../services/security/policy.service'
import { apiError } from '../../utils/api-error'
import { rateLimitKeyFromIp, requireRateLimit } from '../../utils/require-rate-limit'
import { validateBody } from '../../utils/validate'
import { completeStaffLoginBodySchema } from '../../../shared/validators/auth'

/**
 * Second staff sign-in step. This is where the geofence is actually enforced:
 * the browser has now handed us a GPS fix, which is the only location signal
 * precise enough to judge a drawn area against.
 */
export default defineEventHandler(async (event) => {
  await requireRateLimit(event, 'login', rateLimitKeyFromIp(event))
  const body = await validateBody(event, completeStaffLoginBodySchema)
  const ipAddress = getClientIp(event)
  const userAgent = getHeader(event, 'user-agent') ?? null
  const policy = getSecuritySnapshot().policy

  const sessionToken = verifyPendingLoginToken(body.loginToken)
  if (!sessionToken) {
    throw apiError(event, 'UNAUTHENTICATED', 'Sign-in session expired — please sign in again')
  }

  const resolved = await resolveSession(useDb(), sessionToken)
  if (!resolved) {
    throw apiError(event, 'UNAUTHENTICATED', 'Sign-in session expired — please sign in again')
  }

  const device = {
    latitude: body.geo.latitude,
    longitude: body.geo.longitude,
    accuracyM: body.geo.accuracyM ?? null,
  }
  const locationLabel = await resolveBrowserLocation({
    latitude: device.latitude,
    longitude: device.longitude,
    accuracyM: device.accuracyM ?? undefined,
  })

  const capture = await captureAccess(useDb(), {
    eventType: 'login',
    stage: 'login_complete',
    ip: ipAddress,
    device,
    path: '/api/auth/complete-login',
    userAgent,
    requestId: (event.context.requestId as string | undefined) ?? null,
    locationLabel,
    viewer: { id: resolved.user.id, name: resolved.user.name, email: resolved.user.email },
    exempt: resolved.user.accountType === 'super_admin',
    outcome: 'login_success',
    attemptedIdentifier: resolved.user.email,
    attemptedPortal: 'staff',
    accountExists: true,
  })

  if (capture.evaluation.blocked) {
    await logout(useDb(), sessionToken).catch(() => {})
    throw apiError(event, 'FORBIDDEN', policy.blockMessage || 'Access from your location is restricted', {
      reason: 'access_blocked',
      blockReason: capture.evaluation.reason,
      redirectUrl: policy.redirectUrl || null,
    })
  }

  setSessionCookie(event, sessionToken)

  try {
    await writeAudit(event, {
      entityType: 'user',
      entityId: resolved.user.id,
      action: 'auth.login',
      actor: {
        id: resolved.user.id,
        accountType: resolved.user.accountType,
        name: resolved.user.name,
        email: resolved.user.email,
      },
      riskLevel: 'sensitive',
      afterData: { locationLabel, locationSource: 'device' },
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
      userAgent,
      deviceLocation: locationLabel,
      deviceAccuracyM: device.accuracyM,
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
