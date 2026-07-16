import { getHeader } from 'h3'
import { getClientIp } from '../../utils/client-ip'
import { AuthError, login } from '../../auth/auth.service'
import { setSessionCookie } from '../../auth/session-cookie'
import { useDb } from '../../db/client'
import { writeAudit } from '../../services/audit.service'
import { resolveBrowserLocation } from '../../services/browser-geolocation.service'
import { apiError } from '../../utils/api-error'
import { rateLimitKeyFromIp, requireRateLimit } from '../../utils/require-rate-limit'
import { validateBody } from '../../utils/validate'
import { loginBodySchema } from '../../../shared/validators/auth'

export default defineEventHandler(async (event) => {
  await requireRateLimit(event, 'login', rateLimitKeyFromIp(event))
  const body = await validateBody(event, loginBodySchema)
  const identifier = body.portal === 'customer' ? body.username : body.email

  let deviceLocationLabel: string | null = null
  if (body.portal === 'staff') {
    deviceLocationLabel = await resolveBrowserLocation({
      latitude: body.geo.latitude,
      longitude: body.geo.longitude,
      accuracyM: body.geo.accuracyM,
    })
  }

  try {
    const result = await login(useDb(), identifier, body.password, {
      ipAddress: getClientIp(event),
      userAgent: getHeader(event, 'user-agent'),
      portal: body.portal,
      geo: body.portal === 'staff'
        ? {
            latitude: body.geo.latitude,
            longitude: body.geo.longitude,
            accuracyM: body.geo.accuracyM ?? null,
            locationLabel: deviceLocationLabel,
          }
        : null,
    })

    setSessionCookie(event, result.sessionToken)

    try {
      await writeAudit(event, {
        entityType: 'user',
        entityId: result.user.id,
        action: result.accountTypeKey === 'customer' ? 'portal.login' : 'auth.login',
        actor: {
          id: result.user.id,
          accountType: result.accountTypeKey,
          name: result.user.name,
          email: result.user.email,
        },
        riskLevel: 'sensitive',
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
        ipAddress: getClientIp(event),
        userAgent: getHeader(event, 'user-agent'),
        deviceLocation: deviceLocationLabel,
        deviceAccuracyM: body.portal === 'staff' ? body.geo.accuracyM ?? null : null,
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
