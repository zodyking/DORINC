import type { Db } from '../db/client'
import type { InvoiceCustomerSupportNote } from '../../shared/invoice-customer-support'
import { buildInvoiceCustomerSupportNote } from '../../shared/invoice-customer-support'
import { publicInvoiceUrl } from '../../shared/public-invoice'
import { getAppUrl } from './app-config.service'
import {
  getBusinessProfile,
  isCustomerPortalEnabled,
} from './workspace-settings.service'
import { businessProfileToDocumentPdfCompany } from '../../shared/document-pdf-payload'

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
  invoiceNumberFormatted: string,
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

  const onlineAccessUrl = publicInvoiceUrl(appUrl, invoiceNumberFormatted)
  const qrDataUrl = await invoiceOnlineAccessQrDataUrl(onlineAccessUrl)
  return buildInvoiceCustomerSupportNote(company, {
    customerPortalEnabled: false,
    onlineAccessUrl,
    qrDataUrl,
  })
}
