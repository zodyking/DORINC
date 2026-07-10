// Shared HTML → PDF client for pdf-worker and other Node runtimes (DomPDF sidecar).

/** @param {string | undefined | null} paper */
export function normalizePdfPaper(paper) {
  const value = String(paper ?? 'letter').trim().toLowerCase()
  return value === 'a4' ? 'a4' : 'letter'
}

/** @param {{ paper?: string, marginInches?: number, margins?: { top?: number, right?: number, bottom?: number, left?: number } }} [options] */
export function resolvePdfMargins(options = {}) {
  const fallback = options.marginInches ?? 0.5
  return {
    top: options.margins?.top ?? fallback,
    right: options.margins?.right ?? fallback,
    bottom: options.margins?.bottom ?? fallback,
    left: options.margins?.left ?? fallback,
  }
}

/** @param {string} paper */
function pdfPageSizeCss(paper) {
  return paper === 'a4' ? 'A4' : 'Letter'
}

/**
 * @param {string} html
 * @param {{ paper?: string, marginInches?: number, margins?: { top?: number, right?: number, bottom?: number, left?: number } }} [options]
 */
export function injectPdfPageMargins(html, options = {}) {
  const paper = normalizePdfPaper(options.paper)
  const margins = resolvePdfMargins(options)
  const rule = `@page { size: ${pdfPageSizeCss(paper)}; margin: ${margins.top}in ${margins.right}in ${margins.bottom}in ${margins.left}in; }`

  if (/@page\s*\{[^}]*\}/i.test(html)) {
    return html.replace(/@page\s*\{[^}]*\}/i, rule)
  }
  if (/<\/head>/i.test(html)) {
    return html.replace(/<\/head>/i, `<style data-pdf-page="true">\n${rule}\n</style>\n</head>`)
  }
  return `<style data-pdf-page="true">\n${rule}\n</style>\n${html}`
}

export function pdfRenderServiceBaseUrl() {
  return (process.env.PDF_RENDER_URL?.trim() || 'http://laravel-pdf:8080').replace(/\/$/, '')
}

export function shouldUsePdfRenderService() {
  return Boolean(process.env.PDF_RENDER_URL?.trim()) || process.env.NODE_ENV === 'production'
}

/**
 * @param {string} html
 * @param {{ paper?: string, marginInches?: number, margins?: { top?: number, right?: number, bottom?: number, left?: number } }} [options]
 */
export async function renderHtmlToPdfBuffer(html, options = {}) {
  const paper = normalizePdfPaper(options.paper)
  const margins = resolvePdfMargins(options)
  const base = pdfRenderServiceBaseUrl()

  let res
  try {
    res = await fetch(`${base}/render`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        html: injectPdfPageMargins(html, { paper, margins }),
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
      const body = await res.json()
      if (body?.message) detail = body.message
    }
    catch {
      // ignore
    }
    throw new Error(`Laravel PDF service failed (${res.status}): ${detail}`)
  }

  return Buffer.from(await res.arrayBuffer())
}
