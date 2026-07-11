<script setup lang="ts">
import * as pdfjs from 'pdfjs-dist'
import type { PDFDocumentProxy } from 'pdfjs-dist'

const props = defineProps<{
  src: string
  title?: string
  showDownload?: boolean
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
const loading = ref(false)
const error = ref('')
const scale = ref(1)
const pageNum = ref(1)
const numPages = ref(0)
let doc: PDFDocumentProxy | null = null

const zoomPercent = computed(() => `${Math.round(scale.value * 100)}%`)

async function loadDocument(url: string) {
  if (!import.meta.client || !url) return
  loading.value = true
  error.value = ''
  try {
    if (doc) {
      await doc.destroy()
      doc = null
    }
    const task = pdfjs.getDocument(url)
    doc = await task.promise
    numPages.value = doc.numPages
    pageNum.value = 1
    await nextTick()
    await renderPage()
    fitWidth()
  }
  catch (e: unknown) {
    error.value = e instanceof Error ? e.message : 'Could not load PDF'
  }
  finally {
    loading.value = false
  }
}

async function renderPage() {
  if (!doc || !canvasHost.value) return
  const page = await doc.getPage(pageNum.value)
  const viewport = page.getViewport({ scale: scale.value })
  const canvas = document.createElement('canvas')
  const ctx = canvas.getContext('2d')
  if (!ctx) return
  canvas.width = viewport.width
  canvas.height = viewport.height
  canvas.className = 'pdf-viewer__canvas'
  canvasHost.value.replaceChildren(canvas)
  await page.render({ canvasContext: ctx, viewport }).promise
}

function zoomIn() {
  scale.value = Math.min(3, Math.round((scale.value + 0.15) * 100) / 100)
  void renderPage()
}

function zoomOut() {
  scale.value = Math.max(0.4, Math.round((scale.value - 0.15) * 100) / 100)
  void renderPage()
}

function fitWidth() {
  if (!doc || !canvasHost.value) return
  void doc.getPage(pageNum.value).then((page) => {
    const base = page.getViewport({ scale: 1 })
    const width = canvasHost.value?.clientWidth ?? base.width
    scale.value = Math.max(0.4, Math.min(3, (width - 24) / base.width))
    void renderPage()
  })
}

function prevPage() {
  if (pageNum.value <= 1) return
  pageNum.value -= 1
  void renderPage()
}

function nextPage() {
  if (pageNum.value >= numPages.value) return
  pageNum.value += 1
  void renderPage()
}

watch(() => props.src, (url) => {
  if (url) void loadDocument(url)
}, { immediate: true })

onUnmounted(() => {
  void doc?.destroy()
  doc = null
})

defineExpose({ fitWidth, reload: () => loadDocument(props.src) })
</script>

<template>
  <div class="pdf-viewer">
    <div class="pdf-viewer__toolbar" role="toolbar" aria-label="PDF controls">
      <div class="pdf-viewer__group">
        <button type="button" class="btn sm" :disabled="loading || pageNum <= 1" aria-label="Previous page" @click="prevPage">‹</button>
        <span class="pdf-viewer__pages">{{ pageNum }} / {{ numPages || '—' }}</span>
        <button type="button" class="btn sm" :disabled="loading || pageNum >= numPages" aria-label="Next page" @click="nextPage">›</button>
      </div>
      <div class="pdf-viewer__group">
        <button type="button" class="btn sm" :disabled="loading" aria-label="Zoom out" @click="zoomOut">−</button>
        <span class="pdf-viewer__zoom">{{ zoomPercent }}</span>
        <button type="button" class="btn sm" :disabled="loading" aria-label="Zoom in" @click="zoomIn">+</button>
        <button type="button" class="btn sm" :disabled="loading" @click="fitWidth">Fit width</button>
      </div>
      <div class="pdf-viewer__group pdf-viewer__group--end">
        <button v-if="showDownload !== false" type="button" class="btn sm" :disabled="loading" @click="emit('download')">Download</button>
      </div>
    </div>

    <div class="pdf-viewer__stage" :aria-label="title ?? 'PDF document'">
      <p v-if="error" class="pdf-viewer__message pdf-viewer__message--err">{{ error }}</p>
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
  border: 1px solid #e2e8f0;
  border-radius: 12px;
  overflow: hidden;
  background: #525659;
}
.pdf-viewer__toolbar {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px 12px;
  padding: 8px 10px;
  background: #f8fafc;
  border-bottom: 1px solid #e2e8f0;
}
.pdf-viewer__group {
  display: flex;
  align-items: center;
  gap: 6px;
}
.pdf-viewer__group--end {
  margin-left: auto;
}
.pdf-viewer__pages,
.pdf-viewer__zoom {
  min-width: 3.5rem;
  text-align: center;
  font-size: 12px;
  font-weight: 600;
  font-variant-numeric: tabular-nums;
  color: #475569;
}
.pdf-viewer__stage {
  flex: 1;
  overflow: auto;
  padding: 16px;
  min-height: 420px;
}
.pdf-viewer__canvas-host {
  display: flex;
  justify-content: center;
  min-height: 100%;
}
.pdf-viewer__canvas-host :deep(.pdf-viewer__canvas) {
  display: block;
  max-width: 100%;
  height: auto;
  background: #fff;
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.35);
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
</style>
