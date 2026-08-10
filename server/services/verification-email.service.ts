import type { Db } from '../db/client'
import { sendBrandedMail } from '../mail/branded-mail'
import { buildSignupVerificationEmail } from '../mail/templates/system'
import { resolveEmailBrand } from './email-branding.service'
import { getActiveEmailTemplateContent } from './email-templates.service'
import { getAppUrl } from './app-config.service'
import { deliverUserNotification } from './notify-delivery.service'
import { enqueueTemplatedSms } from './sms-notifications.service'
import { resolveUserNotifyDelivery } from './user-notify-channel.service'

interface VerificationEmailInput {
  to: string
  name: string
  verificationToken: string
  phone?: string | null
  messageNotifyChannel?: string | null
}

async function buildVerificationEmail(db: Db, input: VerificationEmailInput) {
  const brand = await resolveEmailBrand(db)
  const appUrl = brand.appUrl || getAppUrl()
  const verifyUrl = `${appUrl}/auth/verify-email?token=${encodeURIComponent(input.verificationToken)}`
  const templateOverride = await getActiveEmailTemplateContent(db, 'signup_verification')
  const mail = buildSignupVerificationEmail({
    name: input.name,
    verifyUrl,
    brandName: brand.brandName,
    appUrl,
    brand,
    templateOverride,
  })
  return { brand, mail, verifyUrl, appUrl }
}

export async function sendVerificationEmail(
  db: Db,
  input: VerificationEmailInput,
) {
  const { brand, mail, verifyUrl } = await buildVerificationEmail(db, input)
  const delivery = await resolveUserNotifyDelivery(db, {
    email: input.to,
    phone: input.phone,
    messageNotifyChannel: input.messageNotifyChannel,
  })

  if (delivery?.channel === 'sms') {
    const result = await enqueueTemplatedSms(db, {
      to: delivery.phone,
      typeKey: 'signup_verification',
      vars: {
        name: input.name,
        verifyUrl,
      },
    })
    if (result.queued) return { channel: 'sms' as const }
  }

  await sendBrandedMail(db, { to: input.to, ...mail }, brand)
  return { channel: 'email' as const }
}

/** Queue verification delivery so account-request responses never wait on SMTP/SMS. */
export async function enqueueVerificationEmail(db: Db, input: VerificationEmailInput) {
  const { mail, verifyUrl } = await buildVerificationEmail(db, input)
  return deliverUserNotification(db, {
    email: input.to,
    phone: input.phone,
    messageNotifyChannel: input.messageNotifyChannel,
  }, {
    sms: {
      typeKey: 'signup_verification',
      vars: {
        name: input.name,
        verifyUrl,
      },
    },
    email: mail,
    meta: { notificationKind: 'email_verification' },
  })
}
