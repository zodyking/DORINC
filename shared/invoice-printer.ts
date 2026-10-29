/**
 * Email-to-print helpers for shop printers (HP ePrint, Brother, Epson, etc.).
 * Shared schema/logic only — sending lives in server/services.
 */

export const PRINTER_EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

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
