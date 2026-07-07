import { z } from 'zod'
import { AuthError, signup } from '../../auth/auth.service'
import { useDb } from '../../db/client'
import { sendMail } from '../../mail/mailer'
import { writeAudit } from '../../services/audit.service'
import { apiError } from '../../utils/api-error'
import { validateBody } from '../../utils/validate'
import { emailSchema, nonEmptyString } from '../../../shared/validators/common'

const signupSchema = z.object({
  name: nonEmptyString.max(120),
  email: emailSchema,
  password: z.string().min(12).max(200),
  accountType: z.enum(['mechanic', 'accountant', 'viewer']),
})

export default defineEventHandler(async (event) => {
  const body = await validateBody(event, signupSchema)
  const db = useDb()

  try {
    const { user, verificationToken } = await signup(db, {
      name: body.name,
      email: body.email,
      password: body.password,
      requestedAccountType: body.accountType,
    })

    const appUrl = useRuntimeConfig(event).public.appUrl
    await sendMail({
      to: user.email,
      subject: 'Verify your DORINC Suite account',
      text: [
        `Hi ${user.name},`,
        '',
        'Confirm your email to continue your DORINC Suite signup:',
        `${appUrl}/auth/verify-email?token=${verificationToken}`,
        '',
        'The link expires in 24 hours. After verification an administrator must approve your account.',
      ].join('\n'),
    })

    await writeAudit(event, {
      entityType: 'user',
      entityId: user.id,
      action: 'auth.signup',
      afterData: { email: user.email, name: user.name, requestedAccountType: body.accountType },
      riskLevel: 'sensitive',
    })

    return {
      status: 'pending_verification',
      message: 'Check your email to verify your account. An admin will then review your request.',
    }
  }
  catch (err) {
    if (err instanceof AuthError && err.code === 'EMAIL_TAKEN') {
      throw apiError(event, 'CONFLICT', 'An account with this email already exists')
    }
    if (err instanceof AuthError && err.code === 'INVALID_ACCOUNT_TYPE') {
      throw apiError(event, 'VALIDATION_ERROR', 'Invalid account type requested')
    }
    throw err
  }
})
