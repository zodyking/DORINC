import type { DocumentPdfCompany } from './document-pdf-payload'

export interface InvoiceCustomerSupportNote {
  title: string
  lines: string[]
  qrDataUrl?: string | null
  qrUrl?: string | null
}

export type InvoiceCustomerSupportInput = {
  portalUrl?: string | null
  customerPortalEnabled?: boolean
  onlineAccessUrl?: string | null
  qrDataUrl?: string | null
}

/** Customer guidance block for invoice PDF templates beside totals. */
export function buildInvoiceCustomerSupportNote(
  company: DocumentPdfCompany,
  portalUrlOrOptions?: string | null | InvoiceCustomerSupportInput,
): InvoiceCustomerSupportNote {
  const options: InvoiceCustomerSupportInput = typeof portalUrlOrOptions === 'string' || portalUrlOrOptions == null
    ? { portalUrl: portalUrlOrOptions, customerPortalEnabled: true }
    : portalUrlOrOptions

  const portalOff = options.customerPortalEnabled === false
  const onlineAccessUrl = options.onlineAccessUrl?.trim() || ''
  if (portalOff && (options.qrDataUrl || onlineAccessUrl)) {
    const lines = [
      'Scan to view this invoice, payment record, and request changes online.',
    ]
    if (onlineAccessUrl) lines.push(onlineAccessUrl)
    return {
      title: 'Online Access',
      lines,
      qrDataUrl: options.qrDataUrl ?? null,
      qrUrl: onlineAccessUrl || null,
    }
  }

  const email = company.email?.trim() || ''
  const portal = options.portalUrl?.replace(/\/$/, '') || ''
  const emailPhrase = email || 'our business email'

  const lines = [
    `For billing questions or general inquiries, email ${emailPhrase}.`,
    'To request service, update vehicle information, or submit invoice correction requests, sign in to your customer portal.',
  ]

  if (portal) lines.push(`Customer portal: ${portal}`)
  lines.push('If you do not have portal access yet, email us to request it.')

  return {
    title: 'Questions, changes, or portal access',
    lines,
  }
}
