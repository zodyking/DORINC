import { z } from 'zod'
import { AuthError, resendVerificationEmail } from '../../auth/auth.service'
import { useDb } from '../../db/client'
import { sendVerificationEmail } from '../../services/verification-email.service'
import { writeAudit } from '../../services/audit.service'
import { apiError } from '../../utils/api-error'
import { rateLimitKeyFromIp, requireRateLimit } from '../../utils/require-rate-limit'
import { validateBody } from '../../utils/validate'
import { emailSchema } from '../../../shared/validators/common'

const resendSchema = z.object({
  email: emailSchema,
  password: z.string().min(1).max(200),
})

export default defineEventHandler(async (event) => {
  const body = await validateBody(event, resendSchema)
  const emailKey = body.email.trim().toLowerCase()
  await requireRateLimit(event, 'verify_email', `${rateLimitKeyFromIp(event)}:${emailKey}`)

  try {
    const { user, verificationToken } = await resendVerificationEmail(useDb(), body.email, body.password)

    await sendVerificationEmail(useDb(), {
      to: user.email,
      name: user.name,
      verificationToken,
    })

    await writeAudit(event, {
      entityType: 'user',
      entityId: user.id,
      action: 'auth.resend_verification',
      afterData: { email: user.email },
      riskLevel: 'sensitive',
    })

    return {
      status: 'sent',
      message: 'Verification email sent. Check your inbox and spam folder — the link expires in 24 hours.',
    }
  }
  catch (err) {
    if (err instanceof AuthError) {
      switch (err.code) {
        case 'INVALID_CREDENTIALS':
          throw apiError(event, 'UNAUTHENTICATED', 'Invalid email or password')
        case 'ALREADY_VERIFIED':
          throw apiError(event, 'CONFLICT', 'This email is already verified', { reason: 'already_verified' })
        case 'NOT_APPROVED':
          throw apiError(event, 'FORBIDDEN', 'This account request was declined', { reason: 'rejected' })
        case 'DISABLED':
          throw apiError(event, 'FORBIDDEN', 'This account has been disabled', { reason: 'disabled' })
        case 'INVALID_ACCOUNT_TYPE':
          throw apiError(event, 'VALIDATION_ERROR', 'Staff email verification only')
      }
    }
    throw err
  }
})
