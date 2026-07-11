<script setup lang="ts">
/**
 * TripBuddy HistoryPdfJsViewer pattern — canvas main view + bottom thumbnail strip.
 * Zoom is controlled by the parent shell via v-model:zoomMult.
 */
import type { PDFDocumentProxy } from 'pdfjs-dist'
import { ensureWorker, pdfjs, renderPdfPageToCanvas } from '~/utils/pdf-js-render'

const props = defineProps<{
  /** Blob object URL — bytes are copied on load so the URL can be revoked. */
  src: string
}>()

const emit = defineEmits<{ 'load-error': [unknown] }>()

const zoomMult = defineModel<number>('zoomMult', { default: 1 })

const loading = ref(true)
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

async function measureFitScale() {
  const doc = pdf.value
  const wrap = (await waitForMainWrap()) || mainWrapRef.value
  if (!doc || !wrap || wrap.clientWidth <= 0) return
  const p = Math.min(Math.max(1, currentPage.value), doc.numPages)
  const page = await doc.getPage(p)
  const vp = page.getViewport({ scale: 1 })
  const pad = 12
  const w = Math.max(120, wrap.clientWidth - pad)
  fitScale.value = Math.max(0.2, Math.min(4, w / vp.width))
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
  thumbCanvasByPage.clear()
  renderToken++
}

async function loadFromUrl(url: string) {
  ensureWorker()
  fetchAbort?.abort()
  fetchAbort = new AbortController()
  cleanupDoc()
  loadError.value = ''
  loading.value = true
  try {
    const res = await fetch(url, { signal: fetchAbort.signal })
    if (!res.ok) throw new Error(`Could not load PDF (${res.status})`)
    const buf = await res.arrayBuffer()
    const doc = await pdfjs.getDocument({ data: buf }).promise
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

  loading.value = false
  await nextTick()
  await new Promise<void>(r => requestAnimationFrame(() => r()))

  if (!pdf.value || numPages.value < 1) return

  try {
    await measureFitScale()
    setupResizeObserver()
    await nextTick()
    await renderThumbnails()
    await nextTick()
    await renderCurrentPage()
  }
  catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Could not render PDF'
    loadError.value = msg
    emit('load-error', e)
    cleanupDoc()
  }
}

watch(() => props.src, (url) => {
  if (url) void loadFromUrl(url)
  else {
    fetchAbort?.abort()
    cleanupDoc()
    loading.value = false
    loadError.value = ''
  }
}, { immediate: true })

watch(zoomMult, async () => {
  if (!pdf.value || numPages.value < 1) return
  await measureFitScale()
  await renderCurrentPage()
})

onUnmounted(() => {
  fetchAbort?.abort()
  cleanupDoc()
})

defineExpose({ currentPage, numPages, reload: () => props.src && loadFromUrl(props.src) })
</script>

<template>
  <div class="pdf-js-viewer">
    <div v-if="loadError" class="pdf-js-viewer__state pdf-js-viewer__state--err">
      {{ loadError }}
    </div>
    <template v-else>
      <div ref="mainWrapRef" class="pdf-js-viewer__main">
        <div v-if="loading" class="pdf-js-viewer__loading" role="status" aria-live="polite">
          Loading PDF…
        </div>
        <template v-else-if="numPages > 0">
          <div class="pdf-js-viewer__page-shell">
            <canvas ref="mainCanvasRef" class="pdf-js-viewer__canvas" />
          </div>
        </template>
      </div>
      <div
        v-if="!loading && numPages > 1"
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
.pdf-js-viewer {
  flex: 1 1 0;
  min-height: 0;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  background: #1e293b;
}

.pdf-js-viewer__state {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 1rem;
  font-size: 13px;
  color: #94a3b8;
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
  justify-content: flex-start;
}

.pdf-js-viewer__loading {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 2;
  font-size: 13px;
  color: #cbd5e1;
  background: rgba(15, 23, 42, 0.55);
  pointer-events: none;
}

.pdf-js-viewer__page-shell {
  box-shadow: 0 4px 24px rgba(0, 0, 0, 0.35);
  border-radius: 2px;
  overflow: hidden;
  line-height: 0;
  flex-shrink: 0;
}

.pdf-js-viewer__canvas {
  display: block;
}

.pdf-js-viewer__thumbs {
  flex-shrink: 0;
  display: flex;
  flex-direction: row;
  gap: 0.4rem;
  padding: 0.35rem 0.4rem calc(0.4rem + env(safe-area-inset-bottom, 0));
  overflow-x: auto;
  -webkit-overflow-scrolling: touch;
  border-top: 1px solid #334155;
  background: #0f172a;
}

.pdf-js-viewer__thumb {
  position: relative;
  flex: 0 0 auto;
  padding: 0.2rem;
  border-radius: 8px;
  border: 2px solid transparent;
  background: rgba(255, 255, 255, 0.04);
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
</style>
