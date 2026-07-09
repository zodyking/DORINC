export interface RenderPdfOptions {
  paper?: 'letter' | 'a4'
  marginInches?: number
}

/** Render HTML to PDF via the Laravel DomPDF sidecar (same contract as pdf-render worker). */
export async function renderHtmlToPdfBuffer(
  html: string,
  options: RenderPdfOptions = {},
): Promise<Buffer> {
  const margin = options.marginInches ?? 0.5
  const paper = options.paper ?? 'letter'
  const base = (process.env.PDF_RENDER_URL?.trim() || 'http://laravel-pdf:8080').replace(/\/$/, '')

  const res = await fetch(`${base}/render`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      html,
      paper,
      margins: { top: margin, right: margin, bottom: margin, left: margin },
    }),
    signal: AbortSignal.timeout(60_000),
  })

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
