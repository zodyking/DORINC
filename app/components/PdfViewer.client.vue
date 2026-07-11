<script setup lang="ts">
import * as pdfjs from 'pdfjs-dist'
import type { PDFDocumentProxy, RenderTask } from 'pdfjs-dist'
import pdfjsWorker from 'pdfjs-dist/build/pdf.worker.min.mjs?url'

pdfjs.GlobalWorkerOptions.workerSrc = pdfjsWorker

const props = defineProps<{
  src: string
  title?: string
  showDownload?: boolean
  showToolbar?: boolean
}>()

const emit = defineEmits<{
  download: []
}>()

const shellEl = ref<HTMLElement | null>(null)
const canvasHost = ref<HTMLElement | null>(null)
const stageEl = ref<HTMLElement | null>(null)

const loading = ref(false)
const error = ref('')
const scale = ref(1)
const pageNum = ref(1)
const pageInput = ref('1')
const numPages = ref(0)
const rotation = ref(0)
const fitMode = ref<'page' | 'width' | null>('page')
const isFullscreen = ref(false)

let doc: PDFDocumentProxy | null = null
let renderTask: RenderTask | null = null

const zoomPercent = computed(() => `${Math.round(scale.value * 100)}%`)
const displayTitle = computed(() => props.title ?? 'PDF document')
const pageLabel = computed(() => (numPages.value ? `${pageNum.value} / ${numPages.value}` : '—'))

function syncPageInput() {
  pageInput.value = String(pageNum.value)
}

async function loadDocument(url: string) {
  if (!url) return
  loading.value = true
  error.value = ''
  try {
    if (doc) {
      await doc.destroy()
      doc = null
    }
    doc = await pdfjs.getDocument({ url, withCredentials: false }).promise
    numPages.value = doc.numPages
    pageNum.value = 1
    rotation.value = 0
    syncPageInput()
    await nextTick()
    applyFit()
    await renderPage()
  }
  catch (e: unknown) {
    error.value = e instanceof Error ? e.message : 'Could not load PDF'
  }
  finally {
    loading.value = false
  }
}

function stageSize() {
  const stage = stageEl.value
  if (!stage) return { width: 0, height: 0 }
  const style = getComputedStyle(stage)
  const padX = parseFloat(style.paddingLeft) + parseFloat(style.paddingRight)
  const padY = parseFloat(style.paddingTop) + parseFloat(style.paddingBottom)
  return {
    width: Math.max(0, stage.clientWidth - padX),
    height: Math.max(0, stage.clientHeight - padY),
  }
}

function applyFit() {
  if (!doc || !canvasHost.value) return
  void doc.getPage(pageNum.value).then((page) => {
    const base = page.getViewport({ scale: 1, rotation: rotation.value })
    const { width, height } = stageSize()
    if (!width || !height) return
    const padding = 32
    if (fitMode.value === 'page') {
      const fitW = (width - padding) / base.width
      const fitH = (height - padding) / base.height
      scale.value = Math.max(0.25, Math.min(4, Math.min(fitW, fitH)))
    }
    else {
      scale.value = Math.max(0.25, Math.min(4, (width - padding) / base.width))
    }
    void renderPage()
  })
}

async function renderPage() {
  if (!doc || !canvasHost.value) return
  renderTask?.cancel()
  const page = await doc.getPage(pageNum.value)
  const outputScale = window.devicePixelRatio || 1
  const viewport = page.getViewport({ scale: scale.value, rotation: rotation.value })
  const canvas = document.createElement('canvas')
  const ctx = canvas.getContext('2d')
  if (!ctx) return

  canvas.width = Math.floor(viewport.width * outputScale)
  canvas.height = Math.floor(viewport.height * outputScale)
  canvas.style.width = `${Math.floor(viewport.width)}px`
  canvas.style.height = `${Math.floor(viewport.height)}px`
  canvas.className = 'pdf-acrobat__canvas'

  canvasHost.value.replaceChildren(canvas)

  const transform = outputScale !== 1
    ? [outputScale, 0, 0, outputScale, 0, 0] as [number, number, number, number, number, number]
    : undefined

  renderTask = page.render({ canvasContext: ctx, viewport, transform })
  await renderTask.promise
  renderTask = null
}

function zoomIn() {
  fitMode.value = null
  scale.value = Math.min(4, Math.round((scale.value + 0.1) * 100) / 100)
  void renderPage()
}

function zoomOut() {
  fitMode.value = null
  scale.value = Math.max(0.25, Math.round((scale.value - 0.1) * 100) / 100)
  void renderPage()
}

function fitWidth() {
  fitMode.value = 'width'
  applyFit()
}

function fitPage() {
  fitMode.value = 'page'
  applyFit()
}

function rotateClockwise() {
  rotation.value = (rotation.value + 90) % 360
  if (fitMode.value) applyFit()
  else void renderPage()
}

function goToPage(raw: string | number) {
  const parsed = Number.parseInt(String(raw), 10)
  if (!Number.isFinite(parsed) || !numPages.value) return
  const next = Math.min(numPages.value, Math.max(1, parsed))
  if (next === pageNum.value) {
    syncPageInput()
    return
  }
  pageNum.value = next
  syncPageInput()
  if (fitMode.value) applyFit()
  else void renderPage()
}

function prevPage() {
  if (pageNum.value <= 1) return
  goToPage(pageNum.value - 1)
}

function nextPage() {
  if (pageNum.value >= numPages.value) return
  goToPage(pageNum.value + 1)
}

function onPageInputBlur() {
  goToPage(pageInput.value)
}

function onPageInputEnter(event: KeyboardEvent) {
  if (event.key === 'Enter') {
    (event.target as HTMLInputElement).blur()
  }
}

function openDirect() {
  if (!props.src) return
  window.open(props.src, '_blank', 'noopener,noreferrer')
}

function printPdf() {
  if (!props.src) return
  const frame = document.createElement('iframe')
  frame.style.display = 'none'
  frame.src = props.src
  frame.onload = () => {
    frame.contentWindow?.focus()
    frame.contentWindow?.print()
    window.setTimeout(() => frame.remove(), 1000)
  }
  document.body.appendChild(frame)
}

async function toggleFullscreen() {
  const el = shellEl.value
  if (!el) return
  if (!document.fullscreenElement) {
    await el.requestFullscreen()
    isFullscreen.value = true
  }
  else {
    await document.exitFullscreen()
    isFullscreen.value = false
  }
}

function onFullscreenChange() {
  isFullscreen.value = !!document.fullscreenElement
  if (fitMode.value) applyFit()
}

function onKeydown(event: KeyboardEvent) {
  if (loading.value || error.value) return
  if (event.key === 'ArrowLeft' || event.key === 'PageUp') {
    event.preventDefault()
    prevPage()
  }
  else if (event.key === 'ArrowRight' || event.key === 'PageDown') {
    event.preventDefault()
    nextPage()
  }
  else if (event.key === 'Home') {
    event.preventDefault()
    goToPage(1)
  }
  else if (event.key === 'End') {
    event.preventDefault()
    goToPage(numPages.value)
  }
}

function onWheel(event: WheelEvent) {
  if (loading.value || error.value || !numPages.value) return
  if (event.ctrlKey || event.metaKey) {
    event.preventDefault()
    if (event.deltaY < 0) zoomIn()
    else zoomOut()
    return
  }
  if (Math.abs(event.deltaY) < 8) return
  event.preventDefault()
  if (event.deltaY > 0) nextPage()
  else prevPage()
}

let resizeObserver: ResizeObserver | null = null

watch(() => props.src, (url) => {
  if (url) void loadDocument(url)
}, { immediate: true })

onMounted(() => {
  document.addEventListener('fullscreenchange', onFullscreenChange)
  resizeObserver = new ResizeObserver(() => {
    if (fitMode.value) applyFit()
  })
  void nextTick(() => {
    if (stageEl.value) resizeObserver?.observe(stageEl.value)
  })
})

onUnmounted(() => {
  document.removeEventListener('fullscreenchange', onFullscreenChange)
  renderTask?.cancel()
  resizeObserver?.disconnect()
  void doc?.destroy()
  doc = null
})

defineExpose({ fitWidth, fitPage, reload: () => loadDocument(props.src) })
</script>

<template>
  <div
    ref="shellEl"
    class="pdf-acrobat"
    :class="{ 'pdf-acrobat--fullscreen': isFullscreen }"
    @keydown="onKeydown"
  >
    <header
      v-if="showToolbar !== false"
      class="pdf-acrobat__toolbar"
      role="toolbar"
      aria-label="PDF controls"
    >
      <div class="pdf-acrobat__toolbar-row">
        <div class="pdf-acrobat__cluster pdf-acrobat__cluster--start">
          <span class="pdf-acrobat__doc-icon" aria-hidden="true">
            <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor">
              <path d="M6 2a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8l-6-6H6zm7 1.5L18.5 9H13V3.5zM8 13h8v1.5H8V13zm0 3.5h8V18H8v-1.5z" />
            </svg>
          </span>
          <span class="pdf-acrobat__title" :title="displayTitle">{{ displayTitle }}</span>
        </div>

        <div class="pdf-acrobat__cluster pdf-acrobat__cluster--center">
          <button
            type="button"
            class="pdf-acrobat__btn pdf-acrobat__btn--icon"
            :disabled="loading || pageNum <= 1"
            aria-label="Previous page"
            @click="prevPage"
          >
            <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor"><path d="M7 14l5-5 5 5H7z" /></svg>
          </button>
          <label class="pdf-acrobat__page-field">
            <span class="sr-only">Page</span>
            <input
              :value="pageInput"
              type="text"
              inputmode="numeric"
              pattern="[0-9]*"
              class="pdf-acrobat__page-input"
              :disabled="loading || !numPages"
              aria-label="Current page"
              @input="pageInput = ($event.target as HTMLInputElement).value"
              @blur="onPageInputBlur"
              @keydown="onPageInputEnter"
            >
            <span class="pdf-acrobat__page-total">/ {{ numPages || '—' }}</span>
          </label>
          <button
            type="button"
            class="pdf-acrobat__btn pdf-acrobat__btn--icon"
            :disabled="loading || pageNum >= numPages"
            aria-label="Next page"
            @click="nextPage"
          >
            <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor"><path d="M7 10l5 5 5-5H7z" /></svg>
          </button>
        </div>

        <div class="pdf-acrobat__cluster pdf-acrobat__cluster--end">
          <button type="button" class="pdf-acrobat__btn pdf-acrobat__btn--icon" :disabled="loading" aria-label="Zoom out" @click="zoomOut">
            <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor"><path d="M5 11h14v2H5z" /></svg>
          </button>
          <span class="pdf-acrobat__zoom">{{ zoomPercent }}</span>
          <button type="button" class="pdf-acrobat__btn pdf-acrobat__btn--icon" :disabled="loading" aria-label="Zoom in" @click="zoomIn">
            <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor"><path d="M11 5h2v14h-2V5zm-6 6h14v2H5v-2z" /></svg>
          </button>
          <span class="pdf-acrobat__divider" aria-hidden="true" />
          <button
            type="button"
            class="pdf-acrobat__btn pdf-acrobat__btn--icon"
            :class="{ 'is-active': fitMode === 'page' }"
            :disabled="loading"
            aria-label="Fit page"
            title="Fit page"
            @click="fitPage"
          >
            <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor"><path d="M4 4h7v2H6v5H4V4zm13 0v7h-2V6h-5V4h7zM4 13h2v5h5v2H4v-7zm16 0v7h-7v-2h5v-5h2z" /></svg>
          </button>
          <button
            type="button"
            class="pdf-acrobat__btn pdf-acrobat__btn--icon"
            :class="{ 'is-active': fitMode === 'width' }"
            :disabled="loading"
            aria-label="Fit width"
            title="Fit width"
            @click="fitWidth"
          >
            <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor"><path d="M3 7h18v2H3V7zm0 8h18v2H3v-2z" /></svg>
          </button>
          <button type="button" class="pdf-acrobat__btn pdf-acrobat__btn--icon" :disabled="loading" aria-label="Rotate clockwise" title="Rotate" @click="rotateClockwise">
            <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor"><path d="M15.55 5.55 14 4v7h7l-1.55-1.55A6.9 6.9 0 0 0 12 5c-3.31 0-6 2.46-6 5.75h2C8 8.57 9.79 7 12 7c1.66 0 3.14.69 4.22 1.8l-1.67 1.75H20V4l-1.55 1.55A8.9 8.9 0 0 0 12 3a8.96 8.96 0 0 0-6.45 2.75L7 7.14A6.97 6.97 0 0 1 12 5z" /></svg>
          </button>
          <span class="pdf-acrobat__divider" aria-hidden="true" />
          <button
            v-if="showDownload !== false"
            type="button"
            class="pdf-acrobat__btn pdf-acrobat__btn--icon"
            :disabled="loading"
            aria-label="Download"
            title="Download"
            @click="emit('download')"
          >
            <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor"><path d="M12 16.5 7.5 12 9 10.5l2 2V4h2v8.5l2-2 1.5 1.5L12 16.5zM5 20v-2h14v2H5z" /></svg>
          </button>
          <button type="button" class="pdf-acrobat__btn pdf-acrobat__btn--icon" :disabled="loading" aria-label="Print" title="Print" @click="printPdf">
            <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor"><path d="M6 9V4h12v5h2a2 2 0 0 1 2 2v5h-4v4H6v-4H4v-5a2 2 0 0 1 2-2h0zm2 0h8V6H8v3zm10 7v-3H6v3h2v3h8v-3h2z" /></svg>
          </button>
          <button type="button" class="pdf-acrobat__btn pdf-acrobat__btn--icon" :disabled="loading" aria-label="Open in new tab" title="Open" @click="openDirect">
            <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor"><path d="M14 3h7v7h-2V6.4l-9.3 9.3-1.4-1.4 9.3-9.3H14V3zM5 5h6v2H7v10h10v-4h2v6H5V5z" /></svg>
          </button>
          <button type="button" class="pdf-acrobat__btn pdf-acrobat__btn--icon" :disabled="loading" aria-label="Fullscreen" title="Fullscreen" @click="toggleFullscreen">
            <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor"><path d="M7 7h4V5H5v6h2V7zm10 0v4h2V5h-6v2h4zM7 17v-4H5v6h6v-2H7zm10 0h-4v2h6v-6h-2v4z" /></svg>
          </button>
        </div>
      </div>
      <div class="pdf-acrobat__status" aria-live="polite">
        <span>{{ pageLabel }}</span>
        <span v-if="loading"> · Loading…</span>
      </div>
    </header>

    <div
      ref="stageEl"
      class="pdf-acrobat__stage"
      tabindex="0"
      :aria-label="displayTitle"
      @wheel="onWheel"
    >
      <p v-if="error" class="pdf-acrobat__message pdf-acrobat__message--err">
        {{ error }}
        <button type="button" class="pdf-acrobat__btn pdf-acrobat__btn--text" @click="openDirect">Open PDF</button>
      </p>
      <p v-else-if="loading && !numPages" class="pdf-acrobat__message">Loading document…</p>
      <div ref="canvasHost" class="pdf-acrobat__canvas-host" />
    </div>
  </div>
</template>

<style scoped>
.sr-only {
  position: absolute;
  width: 1px;
  height: 1px;
  padding: 0;
  margin: -1px;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
  white-space: nowrap;
  border: 0;
}

.pdf-acrobat {
  display: flex;
  flex-direction: column;
  min-height: min(78vh, 920px);
  border: 1px solid #1a1a1a;
  border-radius: 10px;
  overflow: hidden;
  background: #404040;
  color: #f1f3f4;
  font-family: system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif;
}

.pdf-acrobat--fullscreen {
  min-height: 100vh;
  border-radius: 0;
  border: none;
}

.pdf-acrobat__toolbar {
  background: linear-gradient(180deg, #3c3f41 0%, #323639 100%);
  border-bottom: 1px solid #1f1f1f;
  box-shadow: 0 1px 0 rgba(255, 255, 255, 0.06) inset;
}

.pdf-acrobat__toolbar-row {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto minmax(0, 1fr);
  align-items: center;
  gap: 10px;
  padding: 8px 12px;
}

.pdf-acrobat__status {
  padding: 0 12px 8px;
  font-size: 11px;
  color: #9aa0a6;
  text-align: center;
}

.pdf-acrobat__cluster {
  display: flex;
  align-items: center;
  gap: 4px;
  min-width: 0;
}

.pdf-acrobat__cluster--start { justify-self: start; }
.pdf-acrobat__cluster--center { justify-self: center; }
.pdf-acrobat__cluster--end {
  justify-self: end;
  flex-wrap: wrap;
  justify-content: flex-end;
}

.pdf-acrobat__doc-icon {
  display: inline-flex;
  color: #bdc1c6;
  flex: none;
}

.pdf-acrobat__title {
  font-size: 13px;
  font-weight: 500;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  max-width: min(240px, 28vw);
  color: #e8eaed;
}

.pdf-acrobat__page-field {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 0 4px;
}

.pdf-acrobat__page-input {
  width: 2.75rem;
  height: 28px;
  border: 1px solid #5f6368;
  border-radius: 4px;
  background: #202124;
  color: #e8eaed;
  text-align: center;
  font: inherit;
  font-size: 12px;
  font-variant-numeric: tabular-nums;
}

.pdf-acrobat__page-input:focus {
  outline: 2px solid #8ab4f8;
  outline-offset: 0;
  border-color: #8ab4f8;
}

.pdf-acrobat__page-total,
.pdf-acrobat__zoom {
  font-size: 12px;
  font-weight: 500;
  font-variant-numeric: tabular-nums;
  color: #e8eaed;
  min-width: 2.5rem;
  text-align: center;
}

.pdf-acrobat__divider {
  width: 1px;
  height: 22px;
  background: #5f6368;
  margin: 0 4px;
}

.pdf-acrobat__btn {
  border: none;
  background: transparent;
  color: #e8eaed;
  border-radius: 4px;
  cursor: pointer;
  transition: background 0.12s ease;
}

.pdf-acrobat__btn--icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  padding: 0;
}

.pdf-acrobat__btn--text {
  margin-top: 12px;
  padding: 8px 14px;
  border: 1px solid #5f6368;
  font-size: 12px;
}

.pdf-acrobat__btn:hover:not(:disabled) {
  background: rgba(255, 255, 255, 0.12);
}

.pdf-acrobat__btn.is-active {
  background: rgba(138, 180, 248, 0.22);
  color: #fff;
}

.pdf-acrobat__btn:disabled {
  opacity: 0.35;
  cursor: not-allowed;
}

.pdf-acrobat__stage {
  flex: 1;
  overflow: auto;
  padding: 28px 20px;
  min-height: 480px;
  background: #525659;
  outline: none;
}

.pdf-acrobat__canvas-host {
  display: flex;
  justify-content: center;
  align-items: center;
  min-height: calc(100% - 8px);
}

.pdf-acrobat__canvas-host :deep(.pdf-acrobat__canvas) {
  display: block;
  background: #fff;
  box-shadow:
    0 1px 0 rgba(0, 0, 0, 0.2),
    0 8px 24px rgba(0, 0, 0, 0.45);
  image-rendering: auto;
}

.pdf-acrobat__message {
  margin: auto;
  text-align: center;
  font-size: 14px;
  color: #e8eaed;
  padding: 48px 16px;
}

.pdf-acrobat__message--err {
  color: #f9dedc;
}

@media (max-width: 900px) {
  .pdf-acrobat__toolbar-row {
    grid-template-columns: 1fr;
    justify-items: center;
  }
  .pdf-acrobat__cluster--start,
  .pdf-acrobat__cluster--center,
  .pdf-acrobat__cluster--end {
    justify-self: center;
    justify-content: center;
  }
  .pdf-acrobat__title {
    max-width: 70vw;
  }
}
</style>
