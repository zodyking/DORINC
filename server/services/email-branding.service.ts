import type { Db } from '../db/client'
import { BRAND_NAME } from '../../shared/brand'
import type { BusinessProfile } from '../../shared/workspace-settings-defaults'
import { formatPhoneDisplay } from '../../shared/format/phone'
import { getAppUrl } from './app-config.service'
import { resolveInvoicePdfTemplate } from './invoice-template-source.service'
import { getBusinessProfile } from './workspace-settings.service'

export interface EmailBrandContext {
  brandName: string
  brandLegal: string
  brandTagline: string
  logoUrl: string | null
  logoFileId?: string | null
  logoInitial: string
  addressLines: string[]
  phone: string
  email: string
  website: string
  appUrl: string
  settingsUrl: string
  helpUrl: string
  signInUrl: string
}

function formatAddressLines(profile: BusinessProfile): string[] {
  const lines: string[] = []
  if (profile.addressLine1?.trim()) lines.push(profile.addressLine1.trim())
  if (profile.addressLine2?.trim()) lines.push(profile.addressLine2.trim())
  const cityLine = [
    profile.city?.trim(),
    [profile.state?.trim(), profile.postalCode?.trim()].filter(Boolean).join(' '),
  ].filter(Boolean).join(', ')
  if (cityLine) lines.push(cityLine)
  if (profile.country?.trim() && profile.country.trim().toUpperCase() !== 'US') {
    lines.push(profile.country.trim())
  }
  return lines
}

function logoAbsoluteUrl(appUrl: string, fileId: string | null | undefined): string | null {
  if (!fileId) return null
  const base = appUrl.replace(/\/$/, '')
  return `${base}/api/files/${fileId}/preview`
}

function defaultLogoUrl(appUrl: string): string {
  return `${appUrl.replace(/\/$/, '')}/images/dorinc-icon-trans.png`
}

export function buildEmailBrandFromProfile(
  profile: BusinessProfile,
  opts: { appUrl?: string, logoFileId?: string | null } = {},
): EmailBrandContext {
  const appUrl = (opts.appUrl ?? getAppUrl()).replace(/\/$/, '')
  const brandName = profile.businessName?.trim() || BRAND_NAME
  const brandLegal = profile.businessName?.trim() || 'Devon On Site Repairs Inc.'
  const logoUrl = logoAbsoluteUrl(appUrl, opts.logoFileId) ?? defaultLogoUrl(appUrl)
  const logoInitial = (brandName.charAt(0) || 'D').toUpperCase()

  return {
    brandName,
    brandLegal,
    brandTagline: 'Onsite repairs',
    logoUrl,
    logoFileId: opts.logoFileId ?? null,
    logoInitial,
    addressLines: formatAddressLines(profile),
    phone: formatPhoneDisplay(profile.phone?.trim() || ''),
    email: profile.email?.trim() || '',
    website: profile.website?.trim() || '',
    appUrl,
    settingsUrl: `${appUrl}/admin?tab=notifications`,
    helpUrl: `${appUrl}/help`,
    signInUrl: `${appUrl}/auth/login`,
  }
}

/** Resolve company branding for transactional emails (business profile + invoice logo). */
export async function resolveEmailBrand(db: Db): Promise<EmailBrandContext> {
  const [profile, template] = await Promise.all([
    getBusinessProfile(db),
    resolveInvoicePdfTemplate(db).catch(() => null),
  ])
  return buildEmailBrandFromProfile(profile, {
    logoFileId: template?.designSettings?.logoFileId ?? null,
  })
}
