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

/** Extract numeric invoice number from INV-000713, "invoice 713", "invoice #713", etc. */
export function extractInvoiceNumber(raw: string): number | null {
  const text = String(raw || '').trim()
  if (!text) return null

  const patterns = [
    /\binv[-\s]?0*(\d{1,9})\b/i,
    /\binvoice\s*[#:]?\s*0*(\d{1,9})\b/i,
    /\b(?:number|#)\s*0*(\d{1,9})\b/i,
  ]
  for (const re of patterns) {
    const m = text.match(re)
    if (m?.[1]) {
      const n = Number(m[1])
      if (Number.isFinite(n) && n > 0) return n
    }
  }

  // Bare number only when the whole query is digits.
  if (/^\d{1,9}$/.test(text)) {
    const n = Number(text)
    return Number.isFinite(n) && n > 0 ? n : null
  }
  return null
}

/** Extract numeric service log number from SL-0713, "service log 42", etc. */
export function extractServiceLogNumber(raw: string): number | null {
  const text = String(raw || '').trim()
  if (!text) return null

  const patterns = [
    /\bsl[-\s]?0*(\d{1,9})\b/i,
    /\bservice\s*logs?\s*[#:]?\s*0*(\d{1,9})\b/i,
    /\blog\s*[#:]?\s*0*(\d{1,9})\b/i,
  ]
  for (const re of patterns) {
    const m = text.match(re)
    if (m?.[1]) {
      const n = Number(m[1])
      if (Number.isFinite(n) && n > 0) return n
    }
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

  // Count / summary phrasing (tolerate "manny" typo)
  if (/\b(how\s+man+y|count|total number|stats?|summary)\b/.test(text)
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

/** Infer oldest/newest listing from phrases like "oldest invoice". */
export function inferInvoiceSort(raw: string | undefined | null): 'oldest' | 'newest' | null {
  const text = String(raw || '').trim().toLowerCase()
  if (!text) return null
  if (/\b(oldest|earliest)\b/.test(text)) return 'oldest'
  if (/\b(newest|latest|most recent)\b/.test(text)) return 'newest'
  return null
}

/** Remove status/count filler words so remaining text can be used as customer/PO search. */
export function residualInvoiceSearchQuery(raw: string | undefined | null): string {
  let text = String(raw || '').trim()
  if (!text) return ''

  text = text
    .replace(/\binv[-\s]?\d+\b/gi, ' ')
    .replace(/\binvoice\s*[#:]?\s*\d+\b/gi, ' ')
    .replace(/\bhow\s+man+y\b/gi, ' ')
    .replace(/\b(count|total number|stats?|summary|are|is|the|of|for|with|invoices?|ones?)\b/gi, ' ')
    .replace(/\b(whats?|what is|our|oldest|newest|earliest|latest|most recent|first|last|please)\b/gi, ' ')
    .replace(/\b(unpaid|outstanding|open balance|not paid|balance due|overdue|paid|draft|sent|void(?:ed)?|pending(?:\s+manager)?\s*approval)\b/gi, ' ')
    .replace(/[^\w\s&.-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()

  // Drop tiny leftovers
  if (text.length < 2) return ''
  return text
}

export function parseInvoiceLookupStatus(raw: unknown): InvoiceLookupStatus | undefined {
  const text = typeof raw === 'string' ? raw.trim().toLowerCase() : ''
  if (!text) return undefined
  if (text === 'open') return 'unpaid'
  return INVOICE_STATUSES.has(text as InvoiceLookupStatus)
    ? (text as InvoiceLookupStatus)
    : undefined
}

/** True when the user is asking about the currently open record. */
export function refersToCurrentRecord(raw: string | undefined | null): boolean {
  const q = String(raw || '').trim().toLowerCase()
  if (!q) return true
  if (extractInvoiceNumber(q) || extractServiceLogNumber(q)) return false
  if (/\b(this|current)\s+(invoice|log|service\s*log|customer|record|one)\b/.test(q)) return true
  if (/^(this|current|it|that)([?.!\s]|$)/.test(q)) return true
  // Short field questions with no identifier — bind to open page record.
  if (/^(what('s| is)|show|tell me about|whats)\b/.test(q)
    && /\b(balance|total|status|due|customer|lines?|details?)\b/.test(q)
    && !/\b(unpaid|overdue|all|how many)\b/.test(q)) {
    return true
  }
  return false
}

export type ServiceLogLookupStatus =
  | 'draft'
  | 'uploaded'
  | 'ready_for_review'
  | 'in_review'
  | 'needs_info'
  | 'converted_to_invoice'
  | 'rejected'
  | 'review'

export function inferServiceLogStatus(raw: string | undefined | null): ServiceLogLookupStatus | null {
  const text = String(raw || '').trim().toLowerCase()
  if (!text || extractServiceLogNumber(text)) return null
  if (/\breview queue\b|\bin review queue\b|\bqueue\b/.test(text)) return 'review'
  if (/\bneeds?\s*info\b/.test(text)) return 'needs_info'
  if (/\bin[_\s-]?review\b/.test(text)) return 'in_review'
  if (/\bready\s*for\s*review\b/.test(text)) return 'ready_for_review'
  if (/\bconverted\b/.test(text)) return 'converted_to_invoice'
  if (/\brejected\b/.test(text)) return 'rejected'
  if (/\buploaded\b/.test(text)) return 'uploaded'
  if (/\bdraft\b/.test(text)) return 'draft'
  return null
}
