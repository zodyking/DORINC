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
 * Uses pdf.js transform for HiDPI — avoids upside-down WebKit glitches at scale !== 1.
 */
export async function renderPdfPageToCanvas(
  page: PDFPageProxy,
  canvas: HTMLCanvasElement,
  scale: number,
  hiDpi = true,
): Promise<void> {
  const viewport = page.getViewport({ scale, dontFlip: false })
  const ctx = canvas.getContext('2d', { alpha: false })
  if (!ctx) return

  const outputScale = hiDpi && typeof window !== 'undefined'
    ? Math.min(2.5, window.devicePixelRatio || 1)
    : 1

  const pxW = Math.floor(viewport.width * outputScale)
  const pxH = Math.floor(viewport.height * outputScale)
  canvas.width = pxW
  canvas.height = pxH
  canvas.style.width = `${Math.floor(viewport.width)}px`
  canvas.style.height = `${Math.floor(viewport.height)}px`

  ctx.setTransform(1, 0, 0, 1, 0, 0)

  const renderParams: {
    canvasContext: CanvasRenderingContext2D
    viewport: typeof viewport
    background: string
    transform?: number[]
  } = {
    canvasContext: ctx,
    viewport,
    background: '#ffffff',
  }

  if (outputScale !== 1) {
    renderParams.transform = [outputScale, 0, 0, outputScale, 0, 0]
  }

  await page.render(renderParams).promise
}

export { ensureWorker, pdfjs }
