import {
  isPdfUpstreamFailureMessage,
  normalizePdfPaper,
  pdfRenderServiceBaseUrl,
  resolvePdfMargins,
  type PdfPaper,
} from '../../shared/pdf-render'
import type { DocumentPdfRenderPayload } from '../../shared/document-pdf-payload'

export interface RenderPdfOptions {
  paper?: PdfPaper | 'Letter' | 'A4' | string
  marginInches?: number
  margins?: Partial<{ top: number, right: number, bottom: number, left: number }>
}

/** Render invoice/estimate PDF via Laravel Blade + barryvdh/laravel-dompdf. */
export async function renderDocumentPdfBuffer(
  payload: DocumentPdfRenderPayload,
): Promise<Buffer> {
  const base = pdfRenderServiceBaseUrl()
  const path = payload.documentType === 'estimate'
    ? '/api/render/estimate'
    : '/api/render/invoice'

  let res: Response
  try {
    res = await fetch(`${base}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(60_000),
    })
  }
  catch (err) {
    const cause = err instanceof Error ? err.message : String(err)
    console.error('[laravel-pdf] fetch failed', { base, path, cause })
    throw new Error(`Laravel PDF service failed: ${cause}`, { cause: err })
  }

  if (!res.ok) {
    let detail = res.statusText
    try {
      const body = await res.json() as { message?: string }
      if (body?.message) detail = body.message
    }
    catch {
      // ignore
    }
    throw new Error(`Laravel PDF service failed (${res.status}): ${detail}`)
  }

  return Buffer.from(await res.arrayBuffer())
}

/** @deprecated HTML render path removed — use renderDocumentPdfBuffer. */
export async function renderHtmlToPdfBuffer(
  _html: string,
  _options: RenderPdfOptions = {},
): Promise<Buffer> {
  throw new Error('HTML PDF rendering was removed. Use renderDocumentPdfBuffer with a Blade payload.')
}

export { isPdfUpstreamFailureMessage, normalizePdfPaper, resolvePdfMargins }
