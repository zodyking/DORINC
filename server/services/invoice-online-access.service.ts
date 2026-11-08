import { randomBytes, timingSafeEqual } from 'node:crypto'
import { eq } from 'drizzle-orm'
import type { Db } from '../db/client'
import type { InvoiceCustomerSupportNote } from '../../shared/invoice-customer-support'
import { buildInvoiceCustomerSupportNote } from '../../shared/invoice-customer-support'
import {
  publicInvoiceUrl,
  slugifyPublicCustomerName,
  type PublicInvoiceLinkParts,
} from '../../shared/public-invoice'
import { formatInvoiceNumber, invoices } from '../db/schema/invoices'
import { getAppUrl } from './app-config.service'
import {
  getBusinessProfile,
  isCustomerPortalEnabled,
} from './workspace-settings.service'
import { businessProfileToDocumentPdfCompany } from '../../shared/document-pdf-payload'
import { isPgUniqueViolation } from '../utils/pg-errors'

export function mintOnlineAccessToken(): string {
  return randomBytes(18).toString('base64url')
}

export function onlineAccessTokensMatch(left: string, right: string): boolean {
  const a = Buffer.from(String(left ?? ''), 'utf8')
  const b = Buffer.from(String(right ?? ''), 'utf8')
  if (a.length !== b.length || a.length === 0) {
    const dummy = Buffer.alloc(32)
    timingSafeEqual(dummy, dummy)
    return false
  }
  return timingSafeEqual(a, b)
}

export async function resolveInvoiceOnlineAccessLink(
  db: Db,
  invoice: {
    id: string
    invoiceNumber: number
    onlineAccessToken?: string | null
    onlineAccessCustomerSlug?: string | null
    customerSnapshot?: { displayName?: string | null } | null
  },
): Promise<PublicInvoiceLinkParts & { url: string }> {
  let token = invoice.onlineAccessToken?.trim() || ''
  let customerSlug = invoice.onlineAccessCustomerSlug?.trim() || ''
  const invoiceNumberFormatted = formatInvoiceNumber(invoice.invoiceNumber)
  const fallbackSlug = slugifyPublicCustomerName(invoice.customerSnapshot?.displayName)

  if (!token || !customerSlug) {
    token = token || mintOnlineAccessToken()
    customerSlug = customerSlug || fallbackSlug
    try {
      await db.update(invoices)
        .set({
          onlineAccessToken: token,
          onlineAccessCustomerSlug: customerSlug,
          updatedAt: new Date(),
        })
        .where(eq(invoices.id, invoice.id))
    }
    catch (err) {
      if (!isPgUniqueViolation(err, 'invoices_online_access_token_uq')) throw err
      token = mintOnlineAccessToken()
      await db.update(invoices)
        .set({
          onlineAccessToken: token,
          onlineAccessCustomerSlug: customerSlug,
          updatedAt: new Date(),
        })
        .where(eq(invoices.id, invoice.id))
    }
  }

  const parts = { customerSlug, token, invoiceNumberFormatted }
  return { ...parts, url: publicInvoiceUrl(getAppUrl(), parts) }
}

export async function invoiceOnlineAccessQrDataUrl(url: string): Promise<string> {
  const QRCode = (await import('qrcode')).default
  return QRCode.toDataURL(url, {
    width: 280,
    margin: 1,
    errorCorrectionLevel: 'M',
    color: { dark: '#111111', light: '#ffffff' },
  })
}

export async function buildInvoicePdfCustomerSupport(
  db: Db,
  invoice: {
    id: string
    invoiceNumber: number
    invoiceNumberFormatted?: string
    onlineAccessToken?: string | null
    onlineAccessCustomerSlug?: string | null
    customerSnapshot?: { displayName?: string | null } | null
  },
): Promise<InvoiceCustomerSupportNote> {
  const [business, portalEnabled] = await Promise.all([
    getBusinessProfile(db),
    isCustomerPortalEnabled(db),
  ])
  const company = businessProfileToDocumentPdfCompany(business)
  const appUrl = getAppUrl()

  if (portalEnabled) {
    return buildInvoiceCustomerSupportNote(company, {
      portalUrl: `${appUrl.replace(/\/$/, '')}/portal`,
      customerPortalEnabled: true,
    })
  }

  const access = await resolveInvoiceOnlineAccessLink(db, invoice)
  const qrDataUrl = await invoiceOnlineAccessQrDataUrl(access.url)
  return buildInvoiceCustomerSupportNote(company, {
    customerPortalEnabled: false,
    onlineAccessUrl: access.url,
    qrDataUrl,
  })
}
