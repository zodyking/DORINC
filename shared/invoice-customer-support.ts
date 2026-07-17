import type { DocumentPdfCompany } from './document-pdf-payload'

export interface InvoiceCustomerSupportNote {
  title: string
  lines: string[]
}

/** Customer guidance block for invoice PDF templates beside totals. */
export function buildInvoiceCustomerSupportNote(
  company: DocumentPdfCompany,
  portalUrl?: string | null,
): InvoiceCustomerSupportNote {
  const email = company.email?.trim() || ''
  const portal = portalUrl?.replace(/\/$/, '') || ''
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
