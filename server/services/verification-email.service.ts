import type { Db } from '../db/client'
import { sendBrandedMail } from '../mail/branded-mail'
import { buildSignupVerificationEmail } from '../mail/templates/system'
import { resolveEmailBrand } from './email-branding.service'
import { getActiveEmailTemplateContent } from './email-templates.service'
import { getAppUrl } from './app-config.service'
import { enqueueJob } from './jobs.service'

interface VerificationEmailInput {
  to: string
  name: string
  verificationToken: string
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
  return { brand, mail }
}

export async function sendVerificationEmail(
  db: Db,
  input: VerificationEmailInput,
) {
  const { brand, mail } = await buildVerificationEmail(db, input)
  await sendBrandedMail(db, { to: input.to, ...mail }, brand)
}

/** Queue verification delivery so account-request responses never wait on SMTP. */
export async function enqueueVerificationEmail(db: Db, input: VerificationEmailInput) {
  const { mail } = await buildVerificationEmail(db, input)
  return enqueueJob(db, 'email_send', {
    to: input.to,
    subject: mail.subject,
    text: mail.text,
    html: mail.html,
    notificationKind: 'email_verification',
  })
}
