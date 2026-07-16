import { z } from 'zod'
import { AuthError, resetPasswordWithToken } from '../../auth/auth.service'
import { useDb } from '../../db/client'
import { writeAudit } from '../../services/audit.service'
import { apiError } from '../../utils/api-error'
import { rateLimitKeyFromIp, requireRateLimit } from '../../utils/require-rate-limit'
import { validateBody } from '../../utils/validate'

const resetPasswordSchema = z.object({
  token: z.string().min(16).max(128),
  password: z.string().min(12).max(200),
})

export default defineEventHandler(async (event) => {
  await requireRateLimit(event, 'password_reset', rateLimitKeyFromIp(event))
  const body = await validateBody(event, resetPasswordSchema)

  try {
    const user = await resetPasswordWithToken(useDb(), body.token, body.password)

    await writeAudit(event, {
      entityType: 'user',
      entityId: user.id,
      action: 'auth.reset_password',
      riskLevel: 'sensitive',
    })

    return {
      status: 'reset',
      message: 'Password updated — you can sign in with your new password.',
    }
  }
  catch (err) {
    if (err instanceof AuthError && err.code === 'TOKEN_EXPIRED') {
      throw apiError(event, 'VALIDATION_ERROR', 'Reset link has expired — request a new password reset email.')
    }
    if (err instanceof AuthError) {
      throw apiError(event, 'VALIDATION_ERROR', 'Invalid reset link')
    }
    throw err
  }
})
