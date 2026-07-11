export type PdfPaper = 'letter' | 'a4'

export interface PdfPageMargins {
  top: number
  right: number
  bottom: number
  left: number
}

export interface PdfRenderOptions {
  paper?: PdfPaper | 'Letter' | 'A4' | string
  marginInches?: number
  margins?: Partial<PdfPageMargins>
}

/** Normalize designer / API paper values to DomPDF-friendly names. */
export function normalizePdfPaper(paper?: string | null): PdfPaper {
  const value = (paper ?? 'letter').trim().toLowerCase()
  return value === 'a4' ? 'a4' : 'letter'
}

/** DomPDF @page size token (Letter vs A4). */
export function pdfPageSizeCss(paper: PdfPaper): string {
  return paper === 'a4' ? 'A4' : 'Letter'
}

export function resolvePdfMargins(options: PdfRenderOptions = {}): PdfPageMargins {
  const fallback = options.marginInches ?? 0.5
  return {
    top: options.margins?.top ?? fallback,
    right: options.margins?.right ?? fallback,
    bottom: options.margins?.bottom ?? fallback,
    left: options.margins?.left ?? fallback,
  }
}

export function pdfRenderServiceBaseUrl(): string {
  return (process.env.PDF_RENDER_URL?.trim() || 'http://laravel-pdf:8080').replace(/\/$/, '')
}

export function shouldUsePdfRenderService(): boolean {
  return Boolean(process.env.PDF_RENDER_URL?.trim()) || process.env.NODE_ENV === 'production'
}

export function isPdfUpstreamFailureMessage(message: string): boolean {
  const lower = message.toLowerCase()
  return lower.includes('laravel pdf service')
    || lower.includes('pdf render service')
    || lower.includes('fetch failed')
    || lower.includes('econnrefused')
    || lower.includes('enotfound')
    || lower.includes('network')
    || lower.includes('abort')
    || lower.includes('timed out')
    || lower.includes('service unavailable')
}

export function pdfUpstreamUnavailableMessage(cause?: string): string {
  const detail = cause?.trim()
  if (detail) {
    return `PDF render service is unavailable (${detail}). Ensure the laravel-pdf container is running and PDF_RENDER_URL is reachable.`
  }
  return 'PDF render service is unavailable. Ensure the laravel-pdf container is running and PDF_RENDER_URL is reachable.'
}
