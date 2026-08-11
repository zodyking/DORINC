import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import type { Db } from '../db/client'
import {
  buildDorincContactVCard,
  DORINC_CONTACT_DISPLAY_NAME,
  DORINC_CONTACT_PHONE_LABEL,
} from '../../shared/dorinc-contact-vcard'
import { BRAND_NAME } from '../../shared/brand'
import { getAppUrl } from './app-config.service'
import { resolveEmailBrand } from './email-branding.service'
import { getQuoConfig, isQuoSmsEnabled } from './quo.service'

const LOGO_CANDIDATES = [
  join(process.cwd(), 'public/images/dorinc-icon.png'),
  join(process.cwd(), 'public/images/dorinc-icon-trans.png'),
  join(process.cwd(), '.output/public/images/dorinc-icon.png'),
  join(process.cwd(), '.output/public/images/dorinc-icon-trans.png'),
]

async function loadContactPhoto(): Promise<{ bytes: Buffer, contentType: 'image/png' } | null> {
  for (const path of LOGO_CANDIDATES) {
    try {
      const bytes = await readFile(path)
      if (bytes.length) return { bytes, contentType: 'image/png' }
    }
    catch {
      // try next
    }
  }
  return null
}

export async function resolveDorincContactPhone(db: Db): Promise<string | null> {
  const config = await getQuoConfig(db)
  if (!isQuoSmsEnabled(config)) return null
  const phone = config.fromNumber?.trim()
  return phone || null
}

/** Public HTTPS URL to the downloadable DORINC / Susan AI vCard. */
export async function getDorincContactVcardUrl(db: Db): Promise<string> {
  const brand = await resolveEmailBrand(db)
  const appUrl = (brand.appUrl || getAppUrl()).replace(/\/$/, '')
  return `${appUrl}/api/public/dorinc-contact.vcf`
}

export async function buildDorincContactVcardBytes(db: Db): Promise<{
  body: string
  phone: string | null
  filename: string
} | null> {
  const phone = await resolveDorincContactPhone(db)
  if (!phone) return null
  const photo = await loadContactPhoto()
  const body = buildDorincContactVCard({
    phoneE164: phone,
    photo,
    orgName: BRAND_NAME,
  })
  return {
    body,
    phone,
    filename: 'Dorinc.vcf',
  }
}

export function dorincContactLabels() {
  return {
    displayName: DORINC_CONTACT_DISPLAY_NAME,
    phoneLabel: DORINC_CONTACT_PHONE_LABEL,
  }
}
