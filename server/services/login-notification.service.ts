import { UAParser } from 'ua-parser-js'
import type { LoginPortal } from '../auth/auth.service'
import type { Db } from '../db/client'
import { buildLoginNotificationEmail } from '../mail/templates/system'
import { sendBrandedMail } from '../mail/branded-mail'
import { resolveEmailBrand } from './email-branding.service'
import { getAppUrl } from './app-config.service'
import { isNotificationEnabled } from './workspace-settings.service'
import { resolveIpLocation, normalizeClientIp } from './ip-geolocation.service'

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
  const deviceLabel = buildDeviceLabel(opts.userAgent)
  const ipAddress = normalizeClientIp(opts.ipAddress)
  const location = await resolveIpLocation(ipAddress)

  const mail = buildLoginNotificationEmail({
    name: opts.name,
    email: to,
    portal: opts.portal,
    signedInAt: (opts.signedInAt ?? new Date()).toISOString(),
    ipAddress,
    location,
    device: deviceLabel,
    userAgent: opts.userAgent ?? null,
    appUrl: brand.appUrl || getAppUrl(),
    brand,
  })

  return sendBrandedMail(db, { to, ...mail }, brand)
}
