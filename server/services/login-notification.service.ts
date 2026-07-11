import type { LoginPortal } from '../auth/auth.service'
import type { Db } from '../db/client'
import { buildLoginNotificationEmail } from '../mail/templates/system'
import { sendMail } from '../mail/mailer'
import { resolveEmailBrand } from './email-branding.service'
import { getAppUrl } from './app-config.service'
import { isNotificationEnabled } from './workspace-settings.service'

export async function sendLoginNotificationEmail(
  db: Db,
  opts: {
    to: string
    name: string
    portal: LoginPortal
    ipAddress?: string | null
    userAgent?: string | null
    signedInAt?: Date
  },
) {
  const to = opts.to.trim()
  if (!to) return { delivered: false, reason: 'no_recipient' as const }

  const toggleKey = opts.portal === 'customer' ? 'customerLoginAlert' : 'staffLoginAlert'
  if (!(await isNotificationEnabled(db, toggleKey))) {
    return { delivered: false, reason: 'disabled' as const }
  }

  const brand = await resolveEmailBrand(db)
  const mail = buildLoginNotificationEmail({
    name: opts.name,
    portal: opts.portal,
    signedInAt: (opts.signedInAt ?? new Date()).toISOString(),
    ipAddress: opts.ipAddress ?? null,
    userAgent: opts.userAgent ?? null,
    appUrl: brand.appUrl || getAppUrl(),
    brand,
  })

  return sendMail({ to, ...mail })
}
