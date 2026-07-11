import type { Db } from '../db/client'
import { sendMail } from '../mail/mailer'
import { buildSignupVerificationEmail } from '../mail/templates/system'
import { getAppUrl } from './app-config.service'
import { BRAND_NAME } from '../../shared/brand'

export async function sendVerificationEmail(input: {
  to: string
  name: string
  verificationToken: string
}) {
  const appUrl = getAppUrl()
  const verifyUrl = `${appUrl}/auth/verify-email?token=${encodeURIComponent(input.verificationToken)}`
  const mail = buildSignupVerificationEmail({
    name: input.name,
    verifyUrl,
    brandName: BRAND_NAME,
    appUrl,
  })
  await sendMail({ to: input.to, ...mail })
}
