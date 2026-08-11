/**
 * Query helpers for Susan entity tools — normalize INV-/SL- labels and status phrases.
 */

export type InvoiceLookupStatus =
  | 'draft'
  | 'pending_manager_approval'
  | 'sent'
  | 'paid'
  | 'void'
  | 'unpaid'
  | 'outstanding'
  | 'overdue'
  | 'stats'

const INVOICE_STATUSES = new Set<InvoiceLookupStatus>([
  'draft',
  'pending_manager_approval',
  'sent',
  'paid',
  'void',
  'unpaid',
  'outstanding',
  'overdue',
  'stats',
])

/** Extract numeric invoice number from "INV-000713", "inv 713", or bare digits. */
export function extractInvoiceNumber(raw: string): number | null {
  const text = String(raw || '').trim()
  if (!text) return null
  const labeled = text.match(/\binv[-\s]?0*(\d{1,9})\b/i)
  if (labeled?.[1]) {
    const n = Number(labeled[1])
    return Number.isFinite(n) && n > 0 ? n : null
  }
  // Bare number only when the whole query is digits (avoid grabbing years from phrases).
  if (/^\d{1,9}$/.test(text)) {
    const n = Number(text)
    return Number.isFinite(n) && n > 0 ? n : null
  }
  return null
}

/** Extract numeric service log number from "SL-0713", "sl 42", etc. */
export function extractServiceLogNumber(raw: string): number | null {
  const text = String(raw || '').trim()
  if (!text) return null
  const labeled = text.match(/\bsl[-\s]?0*(\d{1,9})\b/i)
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

/** Strip INV- prefix for ILIKE against integer columns stored without the label. */
export function stripInvoiceNumberLabel(raw: string): string {
  return String(raw || '').trim().replace(/^inv[-\s]?/i, '').replace(/^0+(\d)/, '$1')
}

/** Strip SL- prefix for ILIKE against integer log numbers. */
export function stripServiceLogNumberLabel(raw: string): string {
  return String(raw || '').trim().replace(/^sl[-\s]?/i, '').replace(/^0+(\d)/, '$1')
}

/**
 * Infer invoice status filter from free text ("unpaid", "how many overdue", etc.).
 * Returns null when the text looks like a normal search (customer/PO/etc.).
 */
export function inferInvoiceStatus(raw: string | undefined | null): InvoiceLookupStatus | null {
  const text = String(raw || '').trim().toLowerCase()
  if (!text) return null

  if (INVOICE_STATUSES.has(text as InvoiceLookupStatus)) {
    return text as InvoiceLookupStatus
  }

  // Count / summary phrasing
  if (/\b(how many|count|total number|stats?|summary)\b/.test(text)
    && /\b(invoice|invoices)\b/.test(text)
    && !extractInvoiceNumber(text)) {
    if (/\b(unpaid|outstanding|open)\b/.test(text)) return 'unpaid'
    if (/\boverdue\b/.test(text)) return 'overdue'
    if (/\bpaid\b/.test(text)) return 'paid'
    if (/\bdraft\b/.test(text)) return 'draft'
    return 'stats'
  }

  if (/\b(unpaid|outstanding|open balance|not paid|balance due)\b/.test(text)) return 'unpaid'
  if (/\boverdue\b/.test(text)) return 'overdue'
  if (/\bvoid(ed)?\b/.test(text) && !extractInvoiceNumber(text)) return 'void'
  if (/\bpending(?:\s+manager)?\s*approval\b/.test(text)) return 'pending_manager_approval'

  // Lone status words / short phrases without an INV number
  if (!extractInvoiceNumber(text)) {
    if (/^(unpaid|outstanding|open)\b/.test(text)) return 'unpaid'
    if (/^overdue\b/.test(text)) return 'overdue'
    if (/^paid\b/.test(text)) return 'paid'
    if (/^draft\b/.test(text)) return 'draft'
    if (/^sent\b/.test(text)) return 'sent'
    if (/^void\b/.test(text)) return 'void'
  }

  return null
}

export function parseInvoiceLookupStatus(raw: unknown): InvoiceLookupStatus | undefined {
  const text = typeof raw === 'string' ? raw.trim().toLowerCase() : ''
  if (!text) return undefined
  if (text === 'open') return 'unpaid'
  return INVOICE_STATUSES.has(text as InvoiceLookupStatus)
    ? (text as InvoiceLookupStatus)
    : undefined
}
