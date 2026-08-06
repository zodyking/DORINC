import { pdfRenderServiceBaseUrl } from '../../shared/pdf-render'
import type { DocumentPdfRenderPayload } from '../../shared/document-pdf-payload'

export interface HtmlPdfRenderOptions {
  paper?: 'letter' | 'a4'
  margins?: { top: number, right: number, bottom: number, left: number }
}

/** Render arbitrary HTML to PDF via Laravel DomPDF (Letter service log sheet, etc.). */
export async function renderHtmlPdfBuffer(
  html: string,
  options: HtmlPdfRenderOptions = {},
): Promise<Buffer> {
  const base = pdfRenderServiceBaseUrl()
  const path = '/api/render/html'
  let res: Response
  try {
    res = await fetch(`${base}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        html,
        options: {
          paper: options.paper ?? 'letter',
          margins: options.margins ?? { top: 0, right: 0, bottom: 0, left: 0 },
        },
      }),
      signal: AbortSignal.timeout(120_000),
    })
  }
  catch (err) {
    const cause = err instanceof Error ? err.message : String(err)
    console.error('[laravel-pdf] html fetch failed', { base, path, cause })
    throw new Error(`Laravel PDF service failed: ${cause}`, { cause: err })
  }

  const raw = await res.arrayBuffer()
  if (!res.ok) {
    let detail = res.statusText
    const text = Buffer.from(raw).toString('utf8')
    try {
      const body = JSON.parse(text) as { message?: string }
      if (body?.message) detail = body.message
    }
    catch {
      const title = text.match(/<title>([^<]+)<\/title>/i)?.[1]?.trim()
      if (title) detail = title
    }
    throw new Error(`Laravel PDF service failed (${res.status}): ${detail}`)
  }

  return Buffer.from(raw)
}

/** Render invoice/estimate PDF via Laravel Blade + barryvdh/laravel-dompdf. */
export async function renderDocumentPdfBuffer(
  payload: DocumentPdfRenderPayload,
): Promise<Buffer> {
  return renderDocumentBuffer(payload, 'pdf')
}

/** Render invoice/estimate HTML preview via Laravel Blade. */
export async function renderDocumentHtmlBuffer(
  payload: DocumentPdfRenderPayload,
): Promise<Buffer> {
  return renderDocumentBuffer(payload, 'html')
}

async function renderDocumentBuffer(
  payload: DocumentPdfRenderPayload,
  format: 'pdf' | 'html',
): Promise<Buffer> {
  const base = pdfRenderServiceBaseUrl()
  const path = payload.documentType === 'estimate'
    ? `/api/render/estimate${format === 'html' ? '/html' : ''}`
    : `/api/render/invoice${format === 'html' ? '/html' : ''}`

  let res: Response
  try {
    res = await fetch(`${base}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(120_000),
    })
  }
  catch (err) {
    const cause = err instanceof Error ? err.message : String(err)
    console.error('[laravel-pdf] fetch failed', { base, path, cause })
    throw new Error(`Laravel PDF service failed: ${cause}`, { cause: err })
  }

  const raw = await res.arrayBuffer()

  if (!res.ok) {
    let detail = res.statusText
    const text = Buffer.from(raw).toString('utf8')
    try {
      const body = JSON.parse(text) as { message?: string }
      if (body?.message) detail = body.message
    }
    catch {
      const title = text.match(/<title>([^<]+)<\/title>/i)?.[1]?.trim()
      if (title) detail = title
    }
    throw new Error(`Laravel PDF service failed (${res.status}): ${detail}`)
  }

  return Buffer.from(raw)
}
