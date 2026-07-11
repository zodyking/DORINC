<script setup lang="ts">
import * as pdfjs from 'pdfjs-dist'
import type { PDFDocumentProxy } from 'pdfjs-dist'

const props = defineProps<{
  src: string
  title?: string
  showDownload?: boolean
  showToolbar?: boolean
}>()

const emit = defineEmits<{
  download: []
}>()

if (import.meta.client) {
  pdfjs.GlobalWorkerOptions.workerSrc = new URL(
    'pdfjs-dist/build/pdf.worker.min.mjs',
    import.meta.url,
  ).toString()
}

const canvasHost = ref<HTMLElement | null>(null)
const stageEl = ref<HTMLElement | null>(null)
const loading = ref(false)
const error = ref('')
const scale = ref(1)
const pageNum = ref(1)
const numPages = ref(0)
const fitMode = ref<'width' | 'page' | null>('page')
let doc: PDFDocumentProxy | null = null
let renderTask: ReturnType<ReturnType<PDFDocumentProxy['getPage']>['render']> | null = null

const zoomPercent = computed(() => `${Math.round(scale.value * 100)}%`)
const displayTitle = computed(() => props.title ?? 'PDF document')

async function loadDocument(url: string) {
  if (!import.meta.client || !url) return
  loading.value = true
  error.value = ''
  try {
    if (doc) {
      await doc.destroy()
      doc = null
    }
    doc = await pdfjs.getDocument(url).promise
    numPages.value = doc.numPages
    pageNum.value = 1
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
    const base = page.getViewport({ scale: 1 })
    const { width, height } = stageSize()
    if (!width || !height) return
    const padding = 24
    if (fitMode.value === 'page') {
      const fitW = (width - padding) / base.width
      const fitH = (height - padding) / base.height
      scale.value = Math.max(0.4, Math.min(3, Math.min(fitW, fitH)))
    }
    else {
      scale.value = Math.max(0.4, Math.min(3, (width - padding) / base.width))
    }
    void renderPage()
  })
}

async function renderPage() {
  if (!doc || !canvasHost.value) return
  renderTask?.cancel()
  const page = await doc.getPage(pageNum.value)
  const outputScale = window.devicePixelRatio || 1
  const viewport = page.getViewport({ scale: scale.value })
  const canvas = document.createElement('canvas')
  const ctx = canvas.getContext('2d')
  if (!ctx) return

  canvas.width = Math.floor(viewport.width * outputScale)
  canvas.height = Math.floor(viewport.height * outputScale)
  canvas.style.width = `${Math.floor(viewport.width)}px`
  canvas.style.height = `${Math.floor(viewport.height)}px`
  canvas.className = 'pdf-viewer__canvas'

  canvasHost.value.replaceChildren(canvas)

  const transform = outputScale !== 1
    ? [outputScale, 0, 0, outputScale, 0, 0] as [number, number, number, number, number, number]
    : undefined

  renderTask = page.render({
    canvasContext: ctx,
    viewport,
    transform,
  })
  await renderTask.promise
  renderTask = null
}

function zoomIn() {
  fitMode.value = null
  scale.value = Math.min(3, Math.round((scale.value + 0.15) * 100) / 100)
  void renderPage()
}

function zoomOut() {
  fitMode.value = null
  scale.value = Math.max(0.4, Math.round((scale.value - 0.15) * 100) / 100)
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

function prevPage() {
  if (pageNum.value <= 1) return
  pageNum.value -= 1
  if (fitMode.value) applyFit()
  else void renderPage()
}

function nextPage() {
  if (pageNum.value >= numPages.value) return
  pageNum.value += 1
  if (fitMode.value) applyFit()
  else void renderPage()
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
}

let resizeObserver: ResizeObserver | null = null

watch(() => props.src, (url) => {
  if (url) void loadDocument(url)
}, { immediate: true })

onMounted(() => {
  if (!import.meta.client) return
  resizeObserver = new ResizeObserver(() => {
    if (fitMode.value) applyFit()
  })
  void nextTick(() => {
    if (stageEl.value) resizeObserver?.observe(stageEl.value)
  })
})

onUnmounted(() => {
  renderTask?.cancel()
  resizeObserver?.disconnect()
  void doc?.destroy()
  doc = null
})

defineExpose({ fitWidth, fitPage, reload: () => loadDocument(props.src) })
</script>

<template>
  <div class="pdf-viewer" @keydown="onKeydown">
    <div
      v-if="showToolbar !== false"
      class="pdf-viewer__toolbar"
      role="toolbar"
      aria-label="PDF controls"
    >
      <div class="pdf-viewer__group pdf-viewer__group--title">
        <span class="pdf-viewer__title" :title="displayTitle">{{ displayTitle }}</span>
      </div>

      <div class="pdf-viewer__group pdf-viewer__group--center">
        <button
          type="button"
          class="pdf-viewer__icon-btn"
          :disabled="loading || pageNum <= 1"
          aria-label="Previous page"
          @click="prevPage"
        >
          ‹
        </button>
        <span class="pdf-viewer__pages">{{ pageNum }} / {{ numPages || '—' }}</span>
        <button
          type="button"
          class="pdf-viewer__icon-btn"
          :disabled="loading || pageNum >= numPages"
          aria-label="Next page"
          @click="nextPage"
        >
          ›
        </button>
      </div>

      <div class="pdf-viewer__group pdf-viewer__group--end">
        <button
          type="button"
          class="pdf-viewer__icon-btn"
          :disabled="loading"
          aria-label="Zoom out"
          @click="zoomOut"
        >
          −
        </button>
        <span class="pdf-viewer__zoom">{{ zoomPercent }}</span>
        <button
          type="button"
          class="pdf-viewer__icon-btn"
          :disabled="loading"
          aria-label="Zoom in"
          @click="zoomIn"
        >
          +
        </button>
        <button
          type="button"
          class="pdf-viewer__text-btn"
          :class="{ 'is-active': fitMode === 'page' }"
          :disabled="loading"
          @click="fitPage"
        >
          Fit page
        </button>
        <button
          type="button"
          class="pdf-viewer__text-btn"
          :class="{ 'is-active': fitMode === 'width' }"
          :disabled="loading"
          @click="fitWidth"
        >
          Fit width
        </button>
        <button
          v-if="showDownload !== false"
          type="button"
          class="pdf-viewer__text-btn"
          :disabled="loading"
          @click="emit('download')"
        >
          Download
        </button>
        <button
          type="button"
          class="pdf-viewer__text-btn"
          :disabled="loading"
          @click="printPdf"
        >
          Print
        </button>
        <button
          type="button"
          class="pdf-viewer__text-btn"
          :disabled="loading"
          @click="openDirect"
        >
          Open
        </button>
      </div>
    </div>

    <div
      ref="stageEl"
      class="pdf-viewer__stage"
      tabindex="0"
      :aria-label="displayTitle"
    >
      <p v-if="error" class="pdf-viewer__message pdf-viewer__message--err">
        {{ error }}
        <button type="button" class="pdf-viewer__text-btn pdf-viewer__text-btn--light" @click="openDirect">
          Open PDF
        </button>
      </p>
      <p v-else-if="loading" class="pdf-viewer__message">Loading PDF…</p>
      <div ref="canvasHost" class="pdf-viewer__canvas-host" />
    </div>
  </div>
</template>

<style scoped>
.pdf-viewer {
  display: flex;
  flex-direction: column;
  min-height: min(80vh, 960px);
  border: 1px solid #2b2b2b;
  border-radius: 12px;
  overflow: hidden;
  background: #525659;
}
.pdf-viewer__toolbar {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto minmax(0, 1fr);
  align-items: center;
  gap: 8px;
  padding: 6px 10px;
  background: #323639;
  border-bottom: 1px solid #1f1f1f;
  color: #e8eaed;
}
.pdf-viewer__group {
  display: flex;
  align-items: center;
  gap: 4px;
  min-width: 0;
}
.pdf-viewer__group--title {
  justify-self: start;
}
.pdf-viewer__group--center {
  justify-self: center;
}
.pdf-viewer__group--end {
  justify-self: end;
  flex-wrap: wrap;
  justify-content: flex-end;
}
.pdf-viewer__title {
  font-size: 13px;
  font-weight: 500;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  max-width: 220px;
}
.pdf-viewer__pages,
.pdf-viewer__zoom {
  min-width: 3.25rem;
  text-align: center;
  font-size: 12px;
  font-weight: 500;
  font-variant-numeric: tabular-nums;
  color: #e8eaed;
  padding: 0 4px;
}
.pdf-viewer__icon-btn,
.pdf-viewer__text-btn {
  border: none;
  background: transparent;
  color: #e8eaed;
  border-radius: 4px;
  cursor: pointer;
  font-size: 12px;
  line-height: 1;
  padding: 6px 8px;
  transition: background 0.15s ease;
}
.pdf-viewer__icon-btn {
  width: 28px;
  height: 28px;
  padding: 0;
  font-size: 18px;
  font-weight: 300;
}
.pdf-viewer__icon-btn:hover:not(:disabled),
.pdf-viewer__text-btn:hover:not(:disabled) {
  background: rgba(255, 255, 255, 0.12);
}
.pdf-viewer__text-btn.is-active {
  background: rgba(255, 255, 255, 0.16);
}
.pdf-viewer__icon-btn:disabled,
.pdf-viewer__text-btn:disabled {
  opacity: 0.35;
  cursor: not-allowed;
}
.pdf-viewer__text-btn--light {
  margin-top: 10px;
  border: 1px solid rgba(255, 255, 255, 0.25);
}
.pdf-viewer__stage {
  flex: 1;
  overflow: auto;
  padding: 20px;
  min-height: 420px;
  outline: none;
  -webkit-overflow-scrolling: touch;
}
.pdf-viewer__canvas-host {
  display: flex;
  justify-content: center;
  align-items: flex-start;
  min-height: 100%;
}
.pdf-viewer__canvas-host :deep(.pdf-viewer__canvas) {
  display: block;
  background: #fff;
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.45);
  image-rendering: auto;
}
.pdf-viewer__message {
  margin: auto;
  text-align: center;
  font-size: 13px;
  color: #e2e8f0;
  padding: 48px 16px;
}
.pdf-viewer__message--err {
  color: #fecaca;
}
@media (max-width: 720px) {
  .pdf-viewer__toolbar {
    grid-template-columns: 1fr;
    justify-items: stretch;
  }
  .pdf-viewer__group--title,
  .pdf-viewer__group--center,
  .pdf-viewer__group--end {
    justify-self: stretch;
    justify-content: center;
  }
  .pdf-viewer__title {
    max-width: none;
    text-align: center;
  }
}
</style>
