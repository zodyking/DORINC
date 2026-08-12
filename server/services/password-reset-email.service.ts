import type { Db } from '../db/client'
import { sendBrandedMail } from '../mail/branded-mail'
import { buildPasswordResetEmail } from '../mail/templates/system'
import { resolveEmailBrand } from './email-branding.service'
import { getActiveEmailTemplateContent } from './email-templates.service'
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
  const resetUrl = `${appUrl.replace(/\/$/, '')}/auth/reset-password?token=${encodeURIComponent(input.resetToken)}`

  const templateOverride = await getActiveEmailTemplateContent(db, 'password_reset')
  const mail = buildPasswordResetEmail({
    name: input.name,
    resetUrl,
    brandName: brand.brandName,
    appUrl,
    brand,
    templateOverride,
  })
  await sendBrandedMail(db, { to: input.to, ...mail }, brand)
  return { channel: 'email' as const }
}
