import * as pdfjs from 'pdfjs-dist'
import type { PDFPageProxy } from 'pdfjs-dist'
import pdfjsWorker from 'pdfjs-dist/build/pdf.worker.min.mjs?url'

let workerReady = false

function ensureWorker() {
  if (!workerReady) {
    pdfjs.GlobalWorkerOptions.workerSrc = pdfjsWorker
    workerReady = true
  }
}

/**
 * Render a PDF.js page to a canvas at the given scale.
 * TripBuddy HistoryPdfJsViewer pattern — shared by main view and thumbnails.
 */
export async function renderPdfPageToCanvas(
  page: PDFPageProxy,
  canvas: HTMLCanvasElement,
  scale: number,
  hiDpi = true,
): Promise<void> {
  const viewport = page.getViewport({ scale })
  const ctx = canvas.getContext('2d', { alpha: false }) ?? canvas.getContext('2d')
  if (!ctx) return

  const dpr = hiDpi && typeof window !== 'undefined'
    ? Math.min(2.5, window.devicePixelRatio || 1)
    : 1
  const w = Math.floor(viewport.width * dpr)
  const h = Math.floor(viewport.height * dpr)
  canvas.width = w
  canvas.height = h
  canvas.style.width = `${viewport.width}px`
  canvas.style.height = `${viewport.height}px`
  ctx.setTransform(1, 0, 0, 1, 0, 0)
  if (dpr !== 1) ctx.scale(dpr, dpr)
  ctx.fillStyle = '#ffffff'
  ctx.fillRect(0, 0, viewport.width, viewport.height)

  await page.render({
    canvasContext: ctx,
    viewport,
    intent: 'display',
  }).promise
}

export { ensureWorker, pdfjs }
