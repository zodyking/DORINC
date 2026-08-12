import { z } from 'zod'
import { requestPasswordReset } from '../../auth/auth.service'
import { useDb } from '../../db/client'
import { sendPasswordResetEmail } from '../../services/password-reset-email.service'
import { writeAudit } from '../../services/audit.service'
import { rateLimitKeyFromIp, requireRateLimit } from '../../utils/require-rate-limit'
import { validateBody } from '../../utils/validate'
import { emailSchema } from '../../../shared/validators/common'

const forgotPasswordSchema = z.object({
  email: emailSchema,
})

const GENERIC_MESSAGE = 'If an account exists for that email, we sent password reset instructions. Check your inbox and spam folder — the link expires in 1 hour.'

export default defineEventHandler(async (event) => {
  const body = await validateBody(event, forgotPasswordSchema)
  const emailKey = body.email.trim().toLowerCase()
  await requireRateLimit(event, 'password_reset', `${rateLimitKeyFromIp(event)}:${emailKey}`)

  const result = await requestPasswordReset(useDb(), body.email)

  if (result) {
    await sendPasswordResetEmail(useDb(), {
      to: result.user.email,
      name: result.user.name,
      resetToken: result.resetToken,
    })

    await writeAudit(event, {
      entityType: 'user',
      entityId: result.user.id,
      action: 'auth.forgot_password',
      afterData: { email: result.user.email },
      riskLevel: 'sensitive',
    })
  }

  return {
    status: 'sent',
    message: GENERIC_MESSAGE,
  }
})
