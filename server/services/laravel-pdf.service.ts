import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import {
  isPdfUpstreamFailureMessage,
  normalizePdfPaper,
  pdfRenderServiceBaseUrl,
  resolvePdfMargins,
} from '../../shared/pdf-render'
import type { DocumentPdfRenderPayload } from '../../shared/document-pdf-payload'

const BUILTIN_INVOICE_BLADE_CANDIDATES = [
  join(process.cwd(), 'services/laravel-pdf/resources/views/invoices/pdf.blade.php'),
  join(process.cwd(), 'resources/views/invoices/pdf.blade.php'),
]

let cachedBuiltinBlade: string | null = null

/** Built-in invoice Blade source shipped with the Laravel PDF service. */
export async function readBuiltInInvoiceBladeSource(): Promise<string> {
  if (cachedBuiltinBlade) return cachedBuiltinBlade

  let lastError: unknown
  for (const path of BUILTIN_INVOICE_BLADE_CANDIDATES) {
    try {
      cachedBuiltinBlade = await readFile(path, 'utf8')
      return cachedBuiltinBlade
    }
    catch (err) {
      lastError = err
    }
  }

  // Production fallback: ask laravel-pdf for the view on disk.
  try {
    const base = pdfRenderServiceBaseUrl()
    const res = await fetch(`${base}/api/blade/invoice`, {
      method: 'GET',
      signal: AbortSignal.timeout(15_000),
    })
    if (res.ok) {
      const body = await res.json() as { bladeSource?: string }
      if (body?.bladeSource?.trim()) {
        cachedBuiltinBlade = body.bladeSource
        return cachedBuiltinBlade
      }
    }
  }
  catch (err) {
    lastError = err
  }

  throw new Error(
    `Could not read built-in invoice Blade template: ${lastError instanceof Error ? lastError.message : String(lastError)}`,
  )
}

async function postLaravelPdf(
  path: string,
  payload: DocumentPdfRenderPayload,
): Promise<Response> {
  const base = pdfRenderServiceBaseUrl()
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

  return res
}

/** Render invoice/estimate PDF via Laravel Blade + barryvdh/laravel-dompdf. */
export async function renderDocumentPdfBuffer(
  payload: DocumentPdfRenderPayload,
): Promise<Buffer> {
  const path = payload.documentType === 'estimate'
    ? '/api/render/estimate'
    : '/api/render/invoice'
  const res = await postLaravelPdf(path, payload)
  return Buffer.from(await res.arrayBuffer())
}

/** Compile invoice/estimate Blade to HTML for designer preview tabs. */
export async function renderDocumentHtml(
  payload: DocumentPdfRenderPayload,
): Promise<string> {
  const path = payload.documentType === 'estimate'
    ? '/api/render/estimate-html'
    : '/api/render/invoice-html'
  const res = await postLaravelPdf(path, payload)
  const body = await res.json() as { html?: string }
  if (!body?.html || typeof body.html !== 'string') {
    throw new Error('Laravel PDF service returned no HTML')
  }
  return body.html
}

export { isPdfUpstreamFailureMessage, normalizePdfPaper, resolvePdfMargins }
