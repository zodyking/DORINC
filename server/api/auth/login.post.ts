import { getHeader, getRequestIP } from 'h3'
import { z } from 'zod'
import { AuthError, login } from '../../auth/auth.service'
import { setSessionCookie } from '../../auth/session-cookie'
import { useDb } from '../../db/client'
import { writeAudit } from '../../services/audit.service'
import { apiError } from '../../utils/api-error'
import { rateLimitKeyFromIp, requireRateLimit } from '../../utils/require-rate-limit'
import { validateBody } from '../../utils/validate'
import { emailSchema, nonEmptyString } from '../../../shared/validators/common'

const loginSchema = z.discriminatedUnion('portal', [
  z.object({
    portal: z.literal('customer'),
    username: nonEmptyString.max(32),
    password: z.string().min(1).max(200),
  }),
  z.object({
    portal: z.literal('staff'),
    email: emailSchema,
    password: z.string().min(1).max(200),
  }),
])

export default defineEventHandler(async (event) => {
  await requireRateLimit(event, 'login', rateLimitKeyFromIp(event))
  const body = await validateBody(event, loginSchema)
  const identifier = body.portal === 'customer' ? body.username : body.email

  try {
    const result = await login(useDb(), identifier, body.password, {
      ipAddress: getRequestIP(event, { xForwardedFor: true }),
      userAgent: getHeader(event, 'user-agent'),
      portal: body.portal,
    })

    setSessionCookie(event, result.sessionToken)

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

    void import('../../services/login-notification.service')
      .then(({ sendLoginNotificationEmail }) => sendLoginNotificationEmail({
        to: result.user.email,
        name: result.user.name,
        portal: body.portal,
        ipAddress: getRequestIP(event, { xForwardedFor: true }),
        userAgent: getHeader(event, 'user-agent'),
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
            getRequestIP(event, { xForwardedFor: true }) ?? null,
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
          throw apiError(event, 'FORBIDDEN', 'Verify your email before signing in', { reason: 'not_verified' })
        case 'NOT_APPROVED':
          throw apiError(event, 'FORBIDDEN', 'Your account is awaiting admin approval', { reason: 'not_approved' })
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
