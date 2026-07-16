import type { Db } from '../db/client'
import { sendMail } from '../mail/mailer'
import { buildPasswordResetEmail } from '../mail/templates/system'
import { resolveEmailBrand } from './email-branding.service'
import { getAppUrl } from './app-config.service'

export async function sendPasswordResetEmail(
  db: Db,
  input: {
    to: string
    name: string
    resetToken: string
  },
) {
  const brand = await resolveEmailBrand(db)
  const appUrl = brand.appUrl || getAppUrl()
  const resetUrl = `${appUrl}/auth/reset-password?token=${encodeURIComponent(input.resetToken)}`
  const mail = buildPasswordResetEmail({
    name: input.name,
    resetUrl,
    brandName: brand.brandName,
    appUrl,
    brand,
  })
  await sendMail({ to: input.to, ...mail })
}
