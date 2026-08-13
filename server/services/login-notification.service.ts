import { UAParser } from 'ua-parser-js'
import type { LoginPortal } from '../auth/auth.service'
import type { Db } from '../db/client'
import { buildLoginNotificationEmail } from '../mail/templates/system'
import { resolveEmailBrand } from './email-branding.service'
import { getActiveEmailTemplateContent } from './email-templates.service'
import { getAppUrl } from './app-config.service'
import { isNotificationEnabled } from './workspace-settings.service'
import { resolveIpLocation, normalizeClientIp } from './ip-geolocation.service'
import { enqueueJob } from './jobs.service'

function buildDeviceLabel(userAgent: string | null | undefined): string | null {
  if (!userAgent) return null
  const { device, os, browser } = new UAParser(userAgent).getResult()
  const parts: string[] = []
  if (device.vendor && device.model) {
    parts.push(`${device.vendor} ${device.model}`)
  }
  else if (device.model) {
    parts.push(device.model)
  }
  else if (os.name) {
    parts.push(os.name)
  }
  if (browser.name) {
    parts.push(browser.name)
  }
  return parts.length ? parts.join(' - ') : null
}

export async function sendLoginNotificationEmail(
  db: Db,
  opts: {
    to: string
    name: string
    portal: LoginPortal
    userId?: string | null
    ipAddress?: string | null
    userAgent?: string | null
    signedInAt?: Date
    deviceLocation?: string | null
    deviceAccuracyM?: number | null
  },
) {
  const to = opts.to.trim()
  if (!to) return { delivered: false, reason: 'no_recipient' as const }

  const toggleKey = opts.portal === 'customer' ? 'customerLoginAlert' : 'staffLoginAlert'
  if (!(await isNotificationEnabled(db, toggleKey))) {
    return { delivered: false, reason: 'disabled' as const }
  }

  const brand = await resolveEmailBrand(db)
  const deviceLabel = buildDeviceLabel(opts.userAgent)
  const ipAddress = normalizeClientIp(opts.ipAddress)
  const ipLocation = await resolveIpLocation(ipAddress)
  const location = opts.deviceLocation || ipLocation

  const templateOverride = await getActiveEmailTemplateContent(db, 'login_notification')
  const mail = buildLoginNotificationEmail({
    name: opts.name,
    email: to,
    portal: opts.portal,
    signedInAt: (opts.signedInAt ?? new Date()).toISOString(),
    ipAddress,
    location,
    ipLocation: opts.deviceLocation ? ipLocation : null,
    locationAccuracyM: opts.deviceAccuracyM ?? null,
    device: deviceLabel,
    userAgent: opts.userAgent ?? null,
    appUrl: brand.appUrl || getAppUrl(),
    brand,
    templateOverride,
  })

  return enqueueJob(db, 'email_send', {
    to,
    subject: mail.subject,
    text: mail.text,
    html: mail.html,
    notificationKind: 'login_notification',
    ...(opts.userId ? { recipientUserId: opts.userId } : {}),
  }).then(() => ({ delivered: true as const, reason: 'queued' as const }))
}
