/** Ungated invoice page. Path is customer slug + unguessable token + invoice number. */
export const PUBLIC_INVOICE_PATH_PREFIX = '/i'

export interface PublicInvoiceLinkParts {
  customerSlug: string
  token: string
  invoiceNumberFormatted: string
}

export function slugifyPublicCustomerName(name: string | null | undefined): string {
  const slug = String(name ?? '')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48)
  return slug || 'customer'
}

export function publicInvoicePath(parts: PublicInvoiceLinkParts): string {
  const customer = encodeURIComponent(parts.customerSlug.trim().toLowerCase())
  const token = encodeURIComponent(parts.token.trim())
  const number = encodeURIComponent(parts.invoiceNumberFormatted.trim().toUpperCase())
  return `${PUBLIC_INVOICE_PATH_PREFIX}/${customer}/${token}/${number}`
}

export function publicInvoiceUrl(appUrl: string, parts: PublicInvoiceLinkParts): string {
  return `${appUrl.replace(/\/$/, '')}${publicInvoicePath(parts)}`
}

export function decodePublicInvoiceSegment(raw: string | null | undefined): string {
  if (raw == null) return ''
  const text = String(raw).trim()
  if (!text) return ''
  try {
    return decodeURIComponent(text).trim()
  }
  catch {
    return text
  }
}

/** Parse INV-000768, inv-768, or 768 from a public path segment. */
export function parsePublicInvoiceSlug(raw: string | null | undefined): number | null {
  const text = decodePublicInvoiceSegment(raw)
  if (!text) return null

  const labeled = text.match(/^inv[-\s]?0*(\d{1,9})$/i)
  if (labeled?.[1]) {
    const n = Number(labeled[1])
    return Number.isFinite(n) && n > 0 ? n : null
  }

  if (/^\d{1,9}$/.test(text)) {
    const n = Number(text)
    return Number.isFinite(n) && n > 0 ? n : null
  }

  return null
}

export function publicInvoiceLabel(invoiceNumber: number): string {
  return `INV-${String(invoiceNumber).padStart(6, '0')}`
}

export function publicInvoiceSlugsMatch(left: string, right: string): boolean {
  return slugifyPublicCustomerName(left) === slugifyPublicCustomerName(right)
}
