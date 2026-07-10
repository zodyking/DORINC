import type { LoginPortal } from '../auth/auth.service'
import { buildLoginNotificationEmail } from '../mail/templates/system'
import { sendMail } from '../mail/mailer'
import { getAppUrl } from './app-config.service'

export async function sendLoginNotificationEmail(opts: {
  to: string
  name: string
  portal: LoginPortal
  ipAddress?: string | null
  userAgent?: string | null
  signedInAt?: Date
}) {
  const to = opts.to.trim()
  if (!to) return { delivered: false }

  const mail = buildLoginNotificationEmail({
    name: opts.name,
    portal: opts.portal,
    signedInAt: (opts.signedInAt ?? new Date()).toISOString(),
    ipAddress: opts.ipAddress ?? null,
    userAgent: opts.userAgent ?? null,
    appUrl: getAppUrl(),
  })

  return sendMail({ to, ...mail })
}
