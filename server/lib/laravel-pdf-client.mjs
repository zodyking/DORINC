// Laravel Blade + barryvdh/laravel-dompdf client for pdf-worker and other Node runtimes.

export function pdfRenderServiceBaseUrl() {
  return (process.env.PDF_RENDER_URL?.trim() || 'http://laravel-pdf:8080').replace(/\/$/, '')
}

export function shouldUsePdfRenderService() {
  return Boolean(process.env.PDF_RENDER_URL?.trim()) || process.env.NODE_ENV === 'production'
}

const PDF_RENDER_PAYLOAD_VERSION = 2

/**
 * @param {string} raw
 * @returns {import('../../shared/document-pdf-payload').DocumentPdfRenderPayload | null}
 */
export function parsePdfRenderPayload(raw) {
  try {
    const parsed = JSON.parse(raw)
    if (parsed?._pdf_v === PDF_RENDER_PAYLOAD_VERSION && parsed.data && parsed.options) {
      return {
        documentType: parsed.documentType,
        data: parsed.data,
        options: parsed.options,
      }
    }
  }
  catch {
    // legacy HTML jobs
  }
  return null
}

/**
 * @param {import('../../shared/document-pdf-payload').DocumentPdfRenderPayload} payload
 */
export async function renderDocumentPdfBuffer(payload) {
  const base = pdfRenderServiceBaseUrl()
  const path = payload.documentType === 'estimate'
    ? '/api/render/estimate'
    : '/api/render/invoice'

  let res
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
    throw new Error(`Laravel PDF service failed: ${cause}`, { cause: err })
  }

  const raw = Buffer.from(await res.arrayBuffer())

  if (!res.ok) {
    let detail = res.statusText
    const text = raw.toString('utf8')
    try {
      const body = JSON.parse(text)
      if (body?.message) detail = body.message
    }
    catch {
      const title = text.match(/<title>([^<]+)<\/title>/i)?.[1]?.trim()
      if (title) detail = title
    }
    throw new Error(`Laravel PDF service failed (${res.status}): ${detail}`)
  }

  return raw
}
