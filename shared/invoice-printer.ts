/**
 * Email-to-print helpers for shop printers (HP ePrint, Brother, Epson, etc.).
 * Shared schema/logic only — sending lives in server/services.
 */

/** Brother Email Print: at most 10 attachments, 20 MB combined. */
export const EMAIL_PRINT_MAX_ATTACHMENTS = 10
export const EMAIL_PRINT_MAX_BYTES = 20 * 1024 * 1024

export const PRINTER_EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export type EmailPrintAttachment = {
  filename: string
  content: Buffer
  contentType?: string
  contentDisposition?: 'inline' | 'attachment'
}

export function attachmentBytes(att: { content: Buffer }): number {
  return att.content?.length ?? 0
}

export function totalAttachmentBytes(attachments: Array<{ content: Buffer }>): number {
  return attachments.reduce((sum, att) => sum + attachmentBytes(att), 0)
}

/**
 * Keep attachments within Brother Email Print limits (≤10 files, ≤20 MB).
 * Drops trailing files first (service log after invoice) so the primary PDF still prints.
 */
export function fitEmailPrintAttachments<T extends EmailPrintAttachment>(attachments: T[]): T[] {
  const fitted: T[] = []
  let bytes = 0
  for (const att of attachments) {
    if (fitted.length >= EMAIL_PRINT_MAX_ATTACHMENTS) break
    const size = attachmentBytes(att)
    if (size <= 0) continue
    if (size > EMAIL_PRINT_MAX_BYTES) continue
    if (bytes + size > EMAIL_PRINT_MAX_BYTES) continue
    fitted.push(att)
    bytes += size
  }
  return fitted
}

export function normalizePrinterEmail(raw: string | null | undefined): string {
  return String(raw ?? '').trim().toLowerCase()
}

export function isValidPrinterEmail(raw: string | null | undefined): boolean {
  return PRINTER_EMAIL_RE.test(normalizePrinterEmail(raw))
}

/**
 * After each successful invoice print, include a blank service-log sheet
 * when the running count is a multiple of `everyN`.
 * everyN=1 → every invoice; 2 → every other; 3 → every third.
 */
export function shouldAttachBlankServiceLog(
  printedInvoiceCountAfterThisPrint: number,
  everyN: number,
): boolean {
  const n = Math.max(1, Math.floor(Number(everyN)) || 1)
  const count = Math.max(0, Math.floor(Number(printedInvoiceCountAfterThisPrint)) || 0)
  if (count <= 0) return false
  return count % n === 0
}

export type PrintToPrinterArgs = {
  invoiceId?: string
  query?: string
  includeServiceLog?: boolean
  serviceLogOnly?: boolean
}

export function parsePrintToPrinterArgs(raw: unknown): PrintToPrinterArgs {
  const obj = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {}
  const invoiceId = typeof obj.invoiceId === 'string' ? obj.invoiceId.trim() : ''
  const query = typeof obj.query === 'string' ? obj.query.trim() : ''
  return {
    invoiceId: invoiceId || undefined,
    query: query || undefined,
    includeServiceLog: parseOptionalBool(obj.includeServiceLog),
    serviceLogOnly: parseOptionalBool(obj.serviceLogOnly),
  }
}

function parseOptionalBool(value: unknown): boolean | undefined {
  if (typeof value === 'boolean') return value
  if (typeof value === 'string') {
    const text = value.trim().toLowerCase()
    if (text === 'true' || text === '1' || text === 'yes') return true
    if (text === 'false' || text === '0' || text === 'no') return false
  }
  return undefined
}
