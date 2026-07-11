import type { Db } from '../db/client'
import { sendMail } from '../mail/mailer'
import { buildSignupVerificationEmail } from '../mail/templates/system'
import { resolveEmailBrand } from './email-branding.service'
import { getAppUrl } from './app-config.service'

export async function sendVerificationEmail(
  db: Db,
  input: {
    to: string
    name: string
    verificationToken: string
  },
) {
  const brand = await resolveEmailBrand(db)
  const appUrl = brand.appUrl || getAppUrl()
  const verifyUrl = `${appUrl}/auth/verify-email?token=${encodeURIComponent(input.verificationToken)}`
  const mail = buildSignupVerificationEmail({
    name: input.name,
    verifyUrl,
    brandName: brand.brandName,
    appUrl,
    brand,
  })
  await sendMail({ to: input.to, ...mail })
}
