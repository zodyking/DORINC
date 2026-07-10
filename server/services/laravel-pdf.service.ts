import {
  injectPdfPageMargins,
  isPdfUpstreamFailureMessage,
  normalizePdfPaper,
  pdfRenderServiceBaseUrl,
  resolvePdfMargins,
  type PdfPaper,
} from '../../shared/pdf-render'

export interface RenderPdfOptions {
  paper?: PdfPaper | 'Letter' | 'A4' | string
  marginInches?: number
  margins?: Partial<{ top: number, right: number, bottom: number, left: number }>
}

/** Render HTML to PDF via the Laravel DomPDF sidecar (same contract as pdf-render worker). */
export async function renderHtmlToPdfBuffer(
  html: string,
  options: RenderPdfOptions = {},
): Promise<Buffer> {
  const paper = normalizePdfPaper(options.paper)
  const margins = resolvePdfMargins(options)
  const base = pdfRenderServiceBaseUrl()
  const preparedHtml = injectPdfPageMargins(html, { paper, margins })

  let res: Response
  try {
    res = await fetch(`${base}/render`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        html: preparedHtml,
        paper,
        margins,
      }),
      signal: AbortSignal.timeout(60_000),
    })
  }
  catch (err) {
    const cause = err instanceof Error ? err.message : String(err)
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

export { isPdfUpstreamFailureMessage }
