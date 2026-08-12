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

export type InvoiceLookupSort
  = 'newest' | 'oldest' | 'invoice_date' | 'due_date' | 'amount_high' | 'amount_low'

const INVOICE_SORTS = new Set<InvoiceLookupSort>([
  'newest',
  'oldest',
  'invoice_date',
  'due_date',
  'amount_high',
  'amount_low',
])

/**
 * Infer invoice status filter from free text ("unpaid", "how many overdue", etc.).
 * Returns null when the text looks like a normal search (customer/PO/etc.).
 * Ranking phrases (oldest/newest/largest) are handled by inferInvoiceSort — not status.
 */
export function inferInvoiceStatus(raw: string | undefined | null): InvoiceLookupStatus | null {
  const text = String(raw || '').trim().toLowerCase()
  if (!text) return null

  if (INVOICE_STATUSES.has(text as InvoiceLookupStatus)) {
    return text as InvoiceLookupStatus
  }

  // Ranking questions are not status filters.
  if (inferInvoiceSort(text)) return null

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

/**
 * Infer list sort from free text ("oldest invoices", "largest invoices", etc.).
 */
export function inferInvoiceSort(raw: string | undefined | null): InvoiceLookupSort | null {
  const text = String(raw || '').trim().toLowerCase()
  if (!text || extractInvoiceNumber(text)) return null

  if (INVOICE_SORTS.has(text as InvoiceLookupSort)) return text as InvoiceLookupSort

  if (/\b(oldest|earliest|first\s+created|longest\s+ago)\b/.test(text)) return 'oldest'
  if (/\b(newest|latest|most\s+recent|recent(?:ly)?)\b/.test(text)) return 'newest'
  if (/\b(largest|biggest|highest\s+amount|most\s+expensive|top\s+dollar)\b/.test(text)) {
    return 'amount_high'
  }
  if (/\b(smallest|lowest\s+amount|cheapest)\b/.test(text)) return 'amount_low'
  if (/\b(due\s+soon|due\s+date|upcoming\s+due)\b/.test(text)) return 'due_date'
  if (/\binvoice\s+date\b/.test(text)) return 'invoice_date'
  return null
}

export function parseInvoiceLookupSort(raw: unknown): InvoiceLookupSort | undefined {
  const text = typeof raw === 'string' ? raw.trim().toLowerCase() : ''
  if (!text) return undefined
  if (text === 'recent' || text === 'latest') return 'newest'
  if (text === 'earliest') return 'oldest'
  if (text === 'largest' || text === 'highest') return 'amount_high'
  if (text === 'smallest' || text === 'lowest') return 'amount_low'
  return INVOICE_SORTS.has(text as InvoiceLookupSort)
    ? (text as InvoiceLookupSort)
    : undefined
}

export type CustomerRankMetric
  = 'lifetime_billed' | 'open_balance' | 'amount_paid' | 'invoice_count'

const CUSTOMER_RANK_METRICS = new Set<CustomerRankMetric>([
  'lifetime_billed',
  'open_balance',
  'amount_paid',
  'invoice_count',
])

/** Infer customer ranking metric ("top paying customer", "highest open balance", …). */
export function inferCustomerRankMetric(raw: string | undefined | null): CustomerRankMetric | null {
  const text = String(raw || '').trim().toLowerCase()
  if (!text) return null

  if (CUSTOMER_RANK_METRICS.has(text as CustomerRankMetric)) {
    return text as CustomerRankMetric
  }

  if (/\b(top\s+paying|highest\s+paying|best\s+paying|biggest\s+payer|most\s+revenue|highest\s+revenue|most\s+billed|lifetime\s+billed|top\s+customer|biggest\s+customer)\b/.test(text)) {
    return 'lifetime_billed'
  }
  if (/\b(most\s+paid|highest\s+paid|amount\s+paid|collections)\b/.test(text)) {
    return 'amount_paid'
  }
  if (/\b(highest\s+open\s+balance|most\s+owed|largest\s+balance|open\s+balance)\b/.test(text)) {
    return 'open_balance'
  }
  if (/\b(most\s+invoices|highest\s+invoice\s+count|invoice\s+count)\b/.test(text)) {
    return 'invoice_count'
  }
  return null
}

export function parseCustomerRankMetric(raw: unknown): CustomerRankMetric | undefined {
  const text = typeof raw === 'string' ? raw.trim().toLowerCase() : ''
  if (!text) return undefined
  if (text === 'lifetime' || text === 'billed' || text === 'revenue' || text === 'top_paying') {
    return 'lifetime_billed'
  }
  if (text === 'paid' || text === 'collected') return 'amount_paid'
  if (text === 'balance' || text === 'owed') return 'open_balance'
  if (text === 'count' || text === 'invoices') return 'invoice_count'
  return CUSTOMER_RANK_METRICS.has(text as CustomerRankMetric)
    ? (text as CustomerRankMetric)
    : undefined
}

/** Remove status/count/sort filler words so remaining text can be used as customer/PO search. */
export function residualInvoiceSearchQuery(raw: string | undefined | null): string {
  let text = String(raw || '').trim()
  if (!text) return ''

  text = text
    .replace(/\binv[-\s]?\d+\b/gi, ' ')
    .replace(/\binvoice\s*[#:]?\s*\d+\b/gi, ' ')
    .replace(/\bhow\s+man+y\b/gi, ' ')
    .replace(/\b(what'?s?|whats|who'?s?|whos|show|list|find|get|our|my)\b/gi, ' ')
    .replace(/\b(count|total number|stats?|summary|are|is|the|of|for|with|invoices?|ones?)\b/gi, ' ')
    .replace(/\b(unpaid|outstanding|open balance|not paid|balance due|overdue|paid|draft|sent|void(?:ed)?|pending(?:\s+manager)?\s*approval)\b/gi, ' ')
    .replace(/\b(oldest|earliest|newest|latest|most\s+recent|recent(?:ly)?|largest|biggest|highest\s+amount|most\s+expensive|top\s+dollar|smallest|lowest\s+amount|cheapest|due\s+soon|due\s+date|upcoming\s+due|invoice\s+date|first\s+created|longest\s+ago)\b/gi, ' ')
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
