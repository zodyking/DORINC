import * as pdfjs from 'pdfjs-dist'
import { OutputScale } from 'pdfjs-dist'
import type { PDFPageProxy, RenderTask } from 'pdfjs-dist'
import pdfjsWorker from 'pdfjs-dist/build/pdf.worker.min.mjs?url'

let workerReady = false

function ensureWorker() {
  if (!workerReady) {
    pdfjs.GlobalWorkerOptions.workerSrc = pdfjsWorker
    workerReady = true
  }
}

function floorToDivide(n: number, div: number) {
  return Math.floor(n / div) * div
}

/**
 * Render a PDF.js page to a canvas at the given scale.
 * Mirrors the official pdf.js viewer OutputScale + transform pattern (WebKit-safe).
 */
export async function renderPdfPageToCanvas(
  page: PDFPageProxy,
  canvas: HTMLCanvasElement,
  scale: number,
  hiDpi = true,
  activeTask?: { current: RenderTask | null },
): Promise<void> {
  activeTask?.current?.cancel()
  activeTask && (activeTask.current = null)

  const viewport = page.getViewport({ scale })
  const ctx = canvas.getContext('2d', { alpha: false })
  if (!ctx) return

  const { width, height } = viewport
  const outputScale = new OutputScale()
  if (!hiDpi) {
    outputScale.sx = 1
    outputScale.sy = 1
  }

  const canvasWidth = floorToDivide(Math.floor(width * outputScale.sx), 1)
  const canvasHeight = floorToDivide(Math.floor(height * outputScale.sy), 1)
  canvas.width = canvasWidth
  canvas.height = canvasHeight
  canvas.style.width = `${Math.floor(width)}px`
  canvas.style.height = `${Math.floor(height)}px`

  const transform = outputScale.scaled
    ? [outputScale.sx, 0, 0, outputScale.sy, 0, 0]
    : undefined

  const renderTask = page.render({
    canvasContext: ctx,
    viewport,
    background: '#ffffff',
    ...(transform ? { transform } : {}),
  })

  if (activeTask) activeTask.current = renderTask

  try {
    await renderTask.promise
  }
  catch (e: unknown) {
    if (e && typeof e === 'object' && 'name' in e && e.name === 'RenderingCancelledException') {
      return
    }
    throw e
  }
  finally {
    if (activeTask?.current === renderTask) activeTask.current = null
  }
}

export { ensureWorker, pdfjs }
