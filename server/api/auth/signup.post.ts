import { z } from 'zod'
import { AuthError, signup } from '../../auth/auth.service'
import { useDb } from '../../db/client'
import { sendMail } from '../../mail/mailer'
import {
  buildStyledEmail,
  emailButton,
  emailMuted,
  emailParagraph,
  escapeHtml,
} from '../../mail/email-layout'
import { writeAudit } from '../../services/audit.service'
import { getAppUrl } from '../../services/app-config.service'
import { apiError } from '../../utils/api-error'
import { validateBody } from '../../utils/validate'
import { formatPersonName } from '../../../shared/format/person-name'
import { emailSchema, nonEmptyString } from '../../../shared/validators/common'
import { BRAND_NAME } from '../../../shared/brand'

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

    const appUrl = getAppUrl()
    const verifyUrl = `${appUrl}/auth/verify-email?token=${verificationToken}`
    const mail = buildStyledEmail({
      subject: `Verify your ${BRAND_NAME} account`,
      text: [
        `Hi ${user.name},`,
        '',
        `Confirm your email to continue your ${BRAND_NAME} signup:`,
        verifyUrl,
        '',
        'The link expires in 24 hours. After verification an administrator must approve your account.',
      ].join('\n'),
      title: 'Verify your email',
      preheader: `Confirm your ${BRAND_NAME} signup`,
      bodyHtml: [
        emailParagraph(`Hi ${escapeHtml(user.name)},`),
        emailParagraph(`Confirm your email to continue your <strong>${BRAND_NAME}</strong> signup.`),
        emailButton(verifyUrl, 'Verify email'),
        emailMuted('The link expires in 24 hours. After verification an administrator must approve your account.'),
      ].join(''),
      appUrl,
    })
    await sendMail({ to: user.email, ...mail })

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
