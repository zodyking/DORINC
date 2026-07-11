import { z } from 'zod'
import { AuthError, signup } from '../../auth/auth.service'
import { useDb } from '../../db/client'
import { sendVerificationEmail } from '../../services/verification-email.service'
import { writeAudit } from '../../services/audit.service'
import { apiError } from '../../utils/api-error'
import { validateBody } from '../../utils/validate'
import { formatPersonName } from '../../../shared/format/person-name'
import { emailSchema, nonEmptyString } from '../../../shared/validators/common'

const signupSchema = z.object({
  firstName: nonEmptyString.max(60),
  lastName: nonEmptyString.max(60),
  email: emailSchema,
  password: z.string().min(12).max(200),
  accountType: z.enum(['mechanic', 'accountant', 'viewer']),
})

export default defineEventHandler(async (event) => {
  const body = await validateBody(event, signupSchema)
  const db = useDb()

  try {
    const { user, verificationToken } = await signup(db, {
      name: formatPersonName(body.firstName, body.lastName),
      email: body.email,
      password: body.password,
      requestedAccountType: body.accountType,
    })

    await sendVerificationEmail(db, {
      to: user.email,
      name: user.name,
      verificationToken,
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
