import { getHeader, getRequestIP } from 'h3'
import { z } from 'zod'
import { AuthError, login } from '../../auth/auth.service'
import { setSessionCookie } from '../../auth/session-cookie'
import { useDb } from '../../db/client'
import { writeAudit } from '../../services/audit.service'
import { apiError } from '../../utils/api-error'
import { validateBody } from '../../utils/validate'
import { emailSchema } from '../../../shared/validators/common'

const loginSchema = z.object({
  email: emailSchema,
  password: z.string().min(1).max(200),
})

export default defineEventHandler(async (event) => {
  const body = await validateBody(event, loginSchema)

  try {
    const result = await login(useDb(), body.email, body.password, {
      ipAddress: getRequestIP(event, { xForwardedFor: true }),
      userAgent: getHeader(event, 'user-agent'),
    })

    setSessionCookie(event, result.sessionToken)

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
    })

    return {
      user: {
        id: result.user.id,
        name: result.user.name,
        email: result.user.email,
        accountType: result.accountTypeKey,
        mustChangePassword: result.user.mustChangePassword,
      },
    }
  }
  catch (err) {
    if (err instanceof AuthError) {
      switch (err.code) {
        case 'INVALID_CREDENTIALS':
          throw apiError(event, 'UNAUTHENTICATED', 'Invalid email or password')
        case 'NOT_VERIFIED':
          throw apiError(event, 'FORBIDDEN', 'Verify your email before signing in', { reason: 'not_verified' })
        case 'NOT_APPROVED':
          throw apiError(event, 'FORBIDDEN', 'Your account is awaiting admin approval', { reason: 'not_approved' })
        case 'DISABLED':
          throw apiError(event, 'FORBIDDEN', 'This account has been disabled', { reason: 'disabled' })
      }
    }
    throw err
  }
})
