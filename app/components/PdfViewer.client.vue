<script setup lang="ts">
/**
 * TripBuddy HistoryPdfJsViewer pattern — canvas main view + bottom thumbnail strip.
 * Zoom is controlled by the parent shell via v-model:zoomMult.
 */
import type { PDFDocumentProxy } from 'pdfjs-dist'
import { ensureWorker, pdfjs, renderPdfPageToCanvas } from '~/utils/pdf-js-render'

const props = defineProps<{
  /** Blob object URL — used for download links; optional when `blob` is set. */
  src?: string
  /** PDF bytes — preferred; avoids re-fetching blob URLs. */
  blob?: Blob | null
}>()

const emit = defineEmits<{ 'load-error': [unknown] }>()

const zoomMult = defineModel<number>('zoomMult', { default: 1 })

const loading = ref(true)
/** True after the first page canvas render completes — avoids empty gray stage on load. */
const pageReady = ref(false)
const loadError = ref('')
const numPages = ref(0)
const pdf = shallowRef<PDFDocumentProxy | null>(null)

const mainWrapRef = ref<HTMLElement | null>(null)
const mainCanvasRef = ref<HTMLCanvasElement | null>(null)
const currentPage = ref(1)
const fitScale = ref(1)

const thumbCanvasByPage = new Map<number, HTMLCanvasElement>()

let fetchAbort: AbortController | null = null
let resizeObs: ResizeObserver | null = null
let renderToken = 0

const THUMB_MAX_W = 72
const layoutNarrow = ref(false)

function updateLayoutNarrow() {
  layoutNarrow.value = typeof window !== 'undefined'
    && window.matchMedia('(max-width: 640px)').matches
}

function horizontalPad() {
  return layoutNarrow.value ? 4 : 12
}

function verticalPad() {
  return layoutNarrow.value ? 4 : 16
}

function effectiveMainScale() {
  return fitScale.value * zoomMult.value
}

function setThumbCanvas(pageNum: number, el: Element | null) {
  if (el instanceof HTMLCanvasElement) thumbCanvasByPage.set(pageNum, el)
  else thumbCanvasByPage.delete(pageNum)
}

async function selectThumbPage(p: number) {
  if (p < 1 || p > numPages.value) return
  currentPage.value = p
  await measureFitScale()
  await renderCurrentPage()
}

async function waitForMainWrap(maxTries = 48) {
  for (let i = 0; i < maxTries; i++) {
    const wrap = mainWrapRef.value
    if (wrap && wrap.clientWidth > 0) return wrap
    await nextTick()
    await new Promise<void>(r => requestAnimationFrame(() => r()))
  }
  return mainWrapRef.value
}

async function waitForCanvas(maxTries = 60) {
  for (let i = 0; i < maxTries; i++) {
    if (mainCanvasRef.value) return mainCanvasRef.value
    await nextTick()
    await new Promise<void>(r => requestAnimationFrame(() => r()))
  }
  return mainCanvasRef.value
}

async function measureFitScale() {
  updateLayoutNarrow()
  const doc = pdf.value
  const wrap = (await waitForMainWrap()) || mainWrapRef.value
  if (!doc || !wrap || wrap.clientWidth <= 0) return
  const p = Math.min(Math.max(1, currentPage.value), doc.numPages)
  const page = await doc.getPage(p)
  const vp = page.getViewport({ scale: 1, dontFlip: false })
  const padX = horizontalPad()
  const padY = verticalPad()
  const availW = Math.max(80, wrap.clientWidth - padX)
  const availH = Math.max(80, (wrap.clientHeight || wrap.clientWidth * 1.3) - padY)
  const scaleW = availW / vp.width
  const scaleH = availH / vp.height
  // Mobile: fit to width so text stays readable; scroll vertically for the rest.
  // Desktop: fit entire page in view (width + height).
  const fit = layoutNarrow.value ? scaleW : Math.min(scaleW, scaleH)
  fitScale.value = Math.max(0.15, Math.min(4, fit))
}

async function renderCurrentPage() {
  const doc = pdf.value
  const canvas = mainCanvasRef.value
  const p = currentPage.value
  if (!doc || !canvas || numPages.value < 1 || p < 1 || p > numPages.value) return
  const token = ++renderToken
  const scale = effectiveMainScale()
  const page = await doc.getPage(p)
  if (token !== renderToken) return
  await renderPdfPageToCanvas(page, canvas, scale, true)
}

async function renderThumbnails() {
  const doc = pdf.value
  const n = numPages.value
  if (!doc || n < 1) return
  for (let i = 1; i <= n; i++) {
    const canvas = thumbCanvasByPage.get(i)
    if (!canvas) continue
    const page = await doc.getPage(i)
    const vp = page.getViewport({ scale: 1 })
    const scale = THUMB_MAX_W / vp.width
    await renderPdfPageToCanvas(page, canvas, scale, false)
  }
}

function teardownResizeObserver() {
  resizeObs?.disconnect()
  resizeObs = null
}

function setupResizeObserver() {
  teardownResizeObserver()
  const wrap = mainWrapRef.value
  if (!wrap || typeof ResizeObserver === 'undefined') return
  let t = 0
  resizeObs = new ResizeObserver(() => {
    window.clearTimeout(t)
    t = window.setTimeout(async () => {
      await measureFitScale()
      await renderCurrentPage()
    }, 120)
  })
  resizeObs.observe(wrap)
}

function cleanupDoc() {
  teardownResizeObserver()
  if (pdf.value) {
    try {
      void pdf.value.destroy()
    }
    catch { /* ignore */ }
    pdf.value = null
  }
  numPages.value = 0
  currentPage.value = 1
  pageReady.value = false
  thumbCanvasByPage.clear()
  renderToken++
}

async function loadFromBytes(buf: ArrayBuffer) {
  updateLayoutNarrow()
  ensureWorker()
  fetchAbort?.abort()
  fetchAbort = new AbortController()
  cleanupDoc()
  loadError.value = ''
  loading.value = true
  pageReady.value = false
  try {
    const doc = await pdfjs.getDocument({ data: buf.slice(0) }).promise
    pdf.value = doc
    numPages.value = doc.numPages
    currentPage.value = 1
  }
  catch (e: unknown) {
    if (e instanceof Error && e.name === 'AbortError') {
      loading.value = false
      return
    }
    const msg = e instanceof Error ? e.message : 'Could not load PDF'
    loadError.value = msg
    emit('load-error', e)
    cleanupDoc()
    loading.value = false
    return
  }

  await nextTick()
  await waitForCanvas()
  await new Promise<void>(r => requestAnimationFrame(() => requestAnimationFrame(r)))

  if (!pdf.value || numPages.value < 1) {
    loading.value = false
    return
  }

  try {
    await measureFitScale()
    setupResizeObserver()
    await renderCurrentPage()
    pageReady.value = true
    void renderThumbnails()
  }
  catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Could not render PDF'
    loadError.value = msg
    emit('load-error', e)
    cleanupDoc()
  }
  finally {
    loading.value = false
  }
}

async function loadFromUrl(url: string) {
  fetchAbort?.abort()
  fetchAbort = new AbortController()
  try {
    const res = await fetch(url, { signal: fetchAbort.signal })
    if (!res.ok) throw new Error(`Could not load PDF (${res.status})`)
    await loadFromBytes(await res.arrayBuffer())
  }
  catch (e: unknown) {
    if (e instanceof Error && e.name === 'AbortError') {
      loading.value = false
      return
    }
    const msg = e instanceof Error ? e.message : 'Could not load PDF'
    loadError.value = msg
    emit('load-error', e)
    cleanupDoc()
    loading.value = false
  }
}

async function loadSource() {
  if (props.blob) {
    await loadFromBytes(await props.blob.arrayBuffer())
    return
  }
  if (props.src) {
    await loadFromUrl(props.src)
  }
}

watch(() => [props.src, props.blob] as const, () => {
  if (props.blob || props.src) void loadSource()
  else {
    fetchAbort?.abort()
    cleanupDoc()
    loading.value = false
    loadError.value = ''
  }
}, { immediate: true })

watch(zoomMult, async () => {
  if (!pdf.value || numPages.value < 1) return
  await renderCurrentPage()
})

watch(layoutNarrow, async (narrow) => {
  if (narrow && zoomMult.value < 1) zoomMult.value = 1
  if (!pdf.value || numPages.value < 1) return
  await nextTick()
  await measureFitScale()
  await renderCurrentPage()
})

onMounted(() => {
  updateLayoutNarrow()
  window.addEventListener('resize', updateLayoutNarrow)
})

onUnmounted(() => {
  window.removeEventListener('resize', updateLayoutNarrow)
  fetchAbort?.abort()
  cleanupDoc()
})

defineExpose({ currentPage, numPages, reload: () => void loadSource(), refit: async () => {
  await measureFitScale()
  await renderCurrentPage()
} })
</script>

<template>
  <div class="pdf-js-viewer">
    <div v-if="loadError" class="pdf-js-viewer__state pdf-js-viewer__state--err">
      {{ loadError }}
    </div>
    <template v-else>
      <div ref="mainWrapRef" class="pdf-js-viewer__main">
        <div
          v-if="loading || !pageReady"
          class="pdf-js-viewer__loading"
          role="status"
          aria-live="polite"
        >
          Loading PDF…
        </div>
        <div
          class="pdf-js-viewer__page-shell"
          :class="{ 'is-hidden': loading || !pageReady || numPages < 1 }"
        >
          <canvas ref="mainCanvasRef" class="pdf-js-viewer__canvas" />
        </div>
        <p
          v-if="!loading && !loadError && numPages === 0"
          class="pdf-js-viewer__state"
        >
          No pages in this document.
        </p>
      </div>
      <div
        v-if="pageReady && !loading && numPages > 1 && layoutNarrow"
        class="pdf-js-viewer__pager"
        role="navigation"
        aria-label="PDF pages"
      >
        <button
          type="button"
          class="pdf-js-viewer__pager-btn"
          :disabled="currentPage <= 1"
          aria-label="Previous page"
          @click="selectThumbPage(currentPage - 1)"
        >
          ‹
        </button>
        <span class="pdf-js-viewer__pager-label">{{ currentPage }} / {{ numPages }}</span>
        <button
          type="button"
          class="pdf-js-viewer__pager-btn"
          :disabled="currentPage >= numPages"
          aria-label="Next page"
          @click="selectThumbPage(currentPage + 1)"
        >
          ›
        </button>
      </div>
      <div
        v-if="pageReady && !loading && numPages > 1 && !layoutNarrow"
        class="pdf-js-viewer__thumbs"
        role="tablist"
        aria-label="Pages"
      >
        <button
          v-for="p in numPages"
          :key="`th-${p}`"
          type="button"
          role="tab"
          :aria-selected="p === currentPage"
          class="pdf-js-viewer__thumb"
          :class="{ 'pdf-js-viewer__thumb--on': p === currentPage }"
          :title="`Page ${p}`"
          @click="selectThumbPage(p)"
        >
          <span class="pdf-js-viewer__thumb-num">{{ p }}</span>
          <canvas :ref="(el) => setThumbCanvas(p, el as Element | null)" class="pdf-js-viewer__thumb-cv" />
        </button>
      </div>
    </template>
  </div>
</template>

<style scoped>
/* Chrome / Acrobat-style neutral gray stage */
.pdf-js-viewer {
  flex: 1 1 auto;
  min-height: min(68vh, 780px);
  display: flex;
  flex-direction: column;
  overflow: hidden;
  background: #525659;
}

.pdf-js-viewer__state {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 1rem;
  font-size: 13px;
  color: #d1d5db;
}

.pdf-js-viewer__state--err {
  color: #fca5a5;
  text-align: center;
}

.pdf-js-viewer__main {
  flex: 1 1 0;
  min-height: 0;
  position: relative;
  overflow: auto;
  -webkit-overflow-scrolling: touch;
  overscroll-behavior: contain;
  touch-action: pan-x pan-y;
  padding: 0.35rem 0.3rem 0.45rem;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
}

.pdf-js-viewer__loading {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 2;
  font-size: 13px;
  color: #e5e7eb;
  background: rgba(64, 64, 64, 0.45);
  pointer-events: none;
}

.pdf-js-viewer__page-shell {
  box-shadow: 0 4px 24px rgba(0, 0, 0, 0.35);
  border-radius: 2px;
  overflow: hidden;
  line-height: 0;
  flex-shrink: 0;
  width: fit-content;
  max-width: 100%;
}

.pdf-js-viewer__page-shell.is-hidden {
  visibility: hidden;
  position: absolute;
  pointer-events: none;
}

.pdf-js-viewer__canvas {
  display: block;
  max-width: 100%;
  height: auto !important;
}

.pdf-js-viewer__thumbs {
  flex-shrink: 0;
  display: flex;
  flex-direction: row;
  gap: 0.4rem;
  padding: 0.35rem 0.4rem calc(0.4rem + env(safe-area-inset-bottom, 0));
  overflow-x: auto;
  -webkit-overflow-scrolling: touch;
  border-top: 1px solid #484848;
  background: #404040;
}

.pdf-js-viewer__thumb {
  position: relative;
  flex: 0 0 auto;
  padding: 0.2rem;
  border-radius: 8px;
  border: 2px solid transparent;
  background: rgba(255, 255, 255, 0.08);
  cursor: pointer;
  touch-action: manipulation;
}

.pdf-js-viewer__thumb--on {
  border-color: #4f46e5;
  background: rgba(79, 70, 229, 0.14);
}

.pdf-js-viewer__thumb:focus-visible {
  outline: 2px solid #818cf8;
  outline-offset: 2px;
}

.pdf-js-viewer__thumb-num {
  position: absolute;
  top: 2px;
  left: 3px;
  z-index: 1;
  font-size: 0.58rem;
  font-weight: 800;
  color: #fff;
  text-shadow: 0 1px 2px #000;
  pointer-events: none;
}

.pdf-js-viewer__thumb-cv {
  display: block;
  width: 72px;
  height: auto;
  border-radius: 4px;
  background: #fff;
}

.pdf-js-viewer__pager {
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 0.75rem;
  padding: 0.45rem 0.65rem calc(0.5rem + env(safe-area-inset-bottom, 0));
  border-top: 1px solid #484848;
  background: #404040;
}

.pdf-js-viewer__pager-label {
  min-width: 4.5rem;
  text-align: center;
  font-size: 13px;
  font-weight: 700;
  font-variant-numeric: tabular-nums;
  color: #f3f4f6;
}

.pdf-js-viewer__pager-btn {
  min-width: 44px;
  min-height: 44px;
  padding: 0;
  border-radius: 10px;
  border: 1px solid #5c5c5c;
  background: rgba(255, 255, 255, 0.1);
  color: #fff;
  font-size: 1.35rem;
  line-height: 1;
  cursor: pointer;
  touch-action: manipulation;
}

.pdf-js-viewer__pager-btn:disabled {
  opacity: 0.35;
  cursor: not-allowed;
}

.pdf-js-viewer__pager-btn:focus-visible {
  outline: 2px solid #818cf8;
  outline-offset: 2px;
}

@media (max-width: 640px) {
  .pdf-js-viewer {
    min-height: 0;
    flex: 1 1 auto;
  }

  .pdf-js-viewer__main {
    padding: 0.15rem 0.1rem 0.2rem;
    justify-content: flex-start;
  }

  .pdf-js-viewer__page-shell {
    max-width: 100%;
  }
}
</style>
