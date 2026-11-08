/** Ungated invoice page. Number in the path never changes. */
export const PUBLIC_INVOICE_PATH_PREFIX = '/i'

export function publicInvoicePath(invoiceNumberFormatted: string): string {
  const label = invoiceNumberFormatted.trim().toUpperCase()
  return `${PUBLIC_INVOICE_PATH_PREFIX}/${encodeURIComponent(label)}`
}

export function publicInvoiceUrl(appUrl: string, invoiceNumberFormatted: string): string {
  return `${appUrl.replace(/\/$/, '')}${publicInvoicePath(invoiceNumberFormatted)}`
}

/** Parse INV-000768, inv-768, or 768 from a public path segment. */
export function parsePublicInvoiceSlug(raw: string | null | undefined): number | null {
  if (raw == null) return null
  let text = String(raw).trim()
  try {
    text = decodeURIComponent(text)
  }
  catch {
    // keep raw
  }
  text = text.trim()
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
