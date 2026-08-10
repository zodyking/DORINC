import type { Db } from '../db/client'
import { sendBrandedMail } from '../mail/branded-mail'
import { buildPasswordResetEmail } from '../mail/templates/system'
import { resolveEmailBrand } from './email-branding.service'
import { getActiveEmailTemplateContent } from './email-templates.service'
import { getAppUrl } from './app-config.service'
import { resolveUserNotifyDelivery } from './user-notify-channel.service'
import { enqueueTemplatedSms } from './sms-notifications.service'

export async function sendPasswordResetEmail(
  db: Db,
  input: {
    to: string
    name: string
    resetToken: string
    phone?: string | null
    messageNotifyChannel?: string | null
  },
) {
  const brand = await resolveEmailBrand(db)
  const appUrl = brand.appUrl || getAppUrl()
  const resetUrl = `${appUrl.replace(/\/$/, '')}/auth/reset-password?token=${encodeURIComponent(input.resetToken)}`

  const delivery = await resolveUserNotifyDelivery(db, {
    email: input.to,
    phone: input.phone,
    messageNotifyChannel: input.messageNotifyChannel,
  })

  if (delivery?.channel === 'sms') {
    const result = await enqueueTemplatedSms(db, {
      to: delivery.phone,
      typeKey: 'password_reset',
      vars: {
        name: input.name,
        resetUrl,
      },
    })
    if (result.queued) return { channel: 'sms' as const }
  }

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
