import type { PDFPageProxy } from 'pdfjs-dist'

/** Rasterize a PDF.js page to a JPEG data URL (thumbnails, previews). */
export async function renderPdfPageToJpegDataUrl(
  page: PDFPageProxy,
  maxWidth = 120,
): Promise<string> {
  const base = page.getViewport({ scale: 1 })
  const scale = maxWidth / base.width
  const viewport = page.getViewport({ scale })
  const canvas = document.createElement('canvas')
  canvas.width = Math.floor(viewport.width)
  canvas.height = Math.floor(viewport.height)
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('Canvas 2D context unavailable')
  await page.render({ canvasContext: ctx, viewport }).promise
  return canvas.toDataURL('image/jpeg', 0.82)
}
