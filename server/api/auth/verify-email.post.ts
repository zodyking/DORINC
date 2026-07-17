import { z } from 'zod'
import { AuthError, verifyEmail } from '../../auth/auth.service'
import { useDb } from '../../db/client'
import { writeAudit } from '../../services/audit.service'
import { apiError } from '../../utils/api-error'
import { rateLimitKeyFromIp, requireRateLimit } from '../../utils/require-rate-limit'
import { validateBody } from '../../utils/validate'

const verifySchema = z.object({ token: z.string().min(16).max(128) })

export default defineEventHandler(async (event) => {
  await requireRateLimit(event, 'verify_email', rateLimitKeyFromIp(event))
  const { token } = await validateBody(event, verifySchema)

  try {
    const user = await verifyEmail(useDb(), token)

    void writeAudit(event, {
      entityType: 'user',
      entityId: user.id,
      action: 'auth.verify_email',
      riskLevel: 'sensitive',
    }).catch((err) => {
      console.warn('[audit] email verification event failed:', (err as Error).message)
    })

    if (!user.approvedAt) {
      void import('../../services/staff-notifications.service')
        .then(({ notifyUserSignupPendingApproval }) => notifyUserSignupPendingApproval(useDb(), {
          userId: user.id,
          userName: user.name,
          userEmail: user.email,
        }))
        .catch((err) => {
          console.warn('[mail] signup pending approval notification failed:', (err as Error).message)
        })
    }

    return {
      status: user.approvedAt ? 'verified' : 'pending_approval',
      message: user.approvedAt
        ? 'Email verified — you can sign in now.'
        : 'Email verified. An administrator must approve your account before you can sign in.',
    }
  }
  catch (err) {
    if (err instanceof AuthError && err.code === 'TOKEN_EXPIRED') {
      throw apiError(event, 'VALIDATION_ERROR', 'Verification link has expired — sign up again to get a new one')
    }
    if (err instanceof AuthError) {
      throw apiError(event, 'VALIDATION_ERROR', 'Invalid verification link')
    }
    throw err
  }
})
