<script setup lang="ts">
/**
 * Shared PDF viewer — @tato30/vue-pdf (pdf.js).
 * Zoom is controlled by the parent shell via v-model:zoomMult.
 */
import { VuePDF, usePDF } from '@tato30/vue-pdf'
import '@tato30/vue-pdf/style.css'

const props = defineProps<{
  src?: string
  blob?: Blob | null
}>()

const emit = defineEmits<{ 'load-error': [unknown] }>()

const zoomMult = defineModel<number>('zoomMult', { default: 1 })

const pdfSource = ref<string | Uint8Array | undefined>(undefined)
const sourceKey = ref(0)
const loadError = ref('')
const pageReady = ref(false)
const currentPage = ref(1)
const pageWidth = ref(612)
const pageHeight = ref(792)
const displayWidth = ref(0)

const mainWrapRef = ref<HTMLElement | null>(null)
const layoutNarrow = ref(false)

let resizeObs: ResizeObserver | null = null

const { pdf, pages } = usePDF(pdfSource, {
  onError(err: unknown) {
    const msg = err instanceof Error ? err.message : 'Could not load PDF'
    loadError.value = msg
    emit('load-error', err)
  },
})

const numPages = computed(() => pages.value || 0)
const loading = computed(() => Boolean(pdfSource.value) && !pageReady.value && !loadError.value)
const canRender = computed(() => Boolean(pdf.value) && displayWidth.value > 0)

const THUMB_MAX_W = 72

function updateLayoutNarrow() {
  layoutNarrow.value = typeof window !== 'undefined'
    && window.matchMedia('(max-width: 640px)').matches
}

function horizontalPad() {
  return layoutNarrow.value ? 8 : 16
}

function verticalPad() {
  return layoutNarrow.value ? 8 : 20
}

async function waitForLayout(maxTries = 48) {
  for (let i = 0; i < maxTries; i++) {
    const wrap = mainWrapRef.value
    if (wrap && wrap.clientWidth > 0 && wrap.clientHeight > 0) return wrap
    await nextTick()
    await new Promise<void>(r => requestAnimationFrame(() => r()))
  }
  return mainWrapRef.value
}

async function settleLayout() {
  await nextTick()
  await new Promise<void>(r => requestAnimationFrame(() => requestAnimationFrame(r)))
  await waitForLayout()
}

async function refreshPageWidth() {
  const task = pdf.value
  if (!task) return
  const doc = await task.promise
  const p = Math.min(Math.max(1, currentPage.value), doc.numPages)
  const page = await doc.getPage(p)
  pageWidth.value = page.getViewport({ scale: 1 }).width
  pageHeight.value = page.getViewport({ scale: 1 }).height
}

async function measureDisplayWidth() {
  updateLayoutNarrow()
  await refreshPageWidth()
  const wrap = (await waitForLayout()) || mainWrapRef.value
  if (!wrap || wrap.clientWidth <= 0) {
    displayWidth.value = 0
    return
  }

  const availW = Math.max(120, wrap.clientWidth - horizontalPad())
  const availH = Math.max(120, wrap.clientHeight - verticalPad())
  const pw = pageWidth.value
  const ph = pageHeight.value

  const scaleW = availW / pw
  const scaleH = availH / ph
  const fit = layoutNarrow.value ? scaleW : Math.min(scaleW, scaleH)
  const clamped = Math.max(0.2, Math.min(4, fit))
  displayWidth.value = Math.floor(pw * clamped * zoomMult.value)
}

function onPageLoaded(viewport: { width: number; height: number; scale: number }) {
  if (viewport.scale > 0) {
    pageWidth.value = viewport.width / viewport.scale
    pageHeight.value = viewport.height / viewport.scale
  }
  pageReady.value = true
}

async function selectPage(p: number) {
  if (p < 1 || p > numPages.value) return
  pageReady.value = false
  currentPage.value = p
  await settleLayout()
  await measureDisplayWidth()
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
    t = window.setTimeout(() => {
      void measureDisplayWidth()
    }, 100)
  })
  resizeObs.observe(wrap)
}

async function loadSource() {
  pageReady.value = false
  loadError.value = ''
  displayWidth.value = 0
  teardownResizeObserver()

  if (props.blob) {
    pdfSource.value = new Uint8Array(await props.blob.arrayBuffer())
  }
  else if (props.src) {
    pdfSource.value = props.src
  }
  else {
    pdfSource.value = undefined
    return
  }

  sourceKey.value++
  await settleLayout()
  setupResizeObserver()
}

watch(() => [props.src, props.blob] as const, () => {
  void loadSource()
}, { immediate: true })

watch(pdf, async (task) => {
  if (!task) return
  currentPage.value = 1
  pageReady.value = false
  await settleLayout()
  await measureDisplayWidth()
})

watch(zoomMult, () => {
  void measureDisplayWidth()
})

watch(layoutNarrow, async () => {
  if (!pdf.value) return
  if (layoutNarrow.value && zoomMult.value < 1) zoomMult.value = 1
  await settleLayout()
  await measureDisplayWidth()
})

onMounted(() => {
  updateLayoutNarrow()
  window.addEventListener('resize', updateLayoutNarrow)
})

onUnmounted(() => {
  window.removeEventListener('resize', updateLayoutNarrow)
  teardownResizeObserver()
  pdfSource.value = undefined
})

defineExpose({
  currentPage,
  numPages,
  reload: () => void loadSource(),
  refit: async () => {
    pageReady.value = false
    await settleLayout()
    await measureDisplayWidth()
  },
})
</script>

<template>
  <div class="pdf-js-viewer">
    <div v-if="loadError" class="pdf-js-viewer__state pdf-js-viewer__state--err">
      {{ loadError }}
    </div>
    <template v-else-if="pdfSource">
      <div ref="mainWrapRef" class="pdf-js-viewer__main">
        <div
          v-if="loading"
          class="pdf-js-viewer__loading"
          role="status"
          aria-live="polite"
        >
          Loading PDF…
        </div>
        <div class="pdf-js-viewer__page-shell">
          <VuePDF
            v-if="canRender"
            :key="`main-${sourceKey}-${currentPage}-${displayWidth}`"
            :pdf="pdf"
            :page="currentPage"
            :width="displayWidth"
            :auto-destroy="false"
            @loaded="onPageLoaded"
          />
        </div>
        <p
          v-if="pageReady && numPages === 0"
          class="pdf-js-viewer__state"
        >
          No pages in this document.
        </p>
      </div>
      <div
        v-if="pageReady && numPages > 1 && layoutNarrow"
        class="pdf-js-viewer__pager"
        role="navigation"
        aria-label="PDF pages"
      >
        <button
          type="button"
          class="pdf-js-viewer__pager-btn"
          :disabled="currentPage <= 1"
          aria-label="Previous page"
          @click="selectPage(currentPage - 1)"
        >
          Prev
        </button>
        <span class="pdf-js-viewer__pager-label">{{ currentPage }} / {{ numPages }}</span>
        <button
          type="button"
          class="pdf-js-viewer__pager-btn"
          :disabled="currentPage >= numPages"
          aria-label="Next page"
          @click="selectPage(currentPage + 1)"
        >
          Next
        </button>
      </div>
      <div
        v-if="pageReady && numPages > 1 && !layoutNarrow"
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
          @click="selectPage(p)"
        >
          <span class="pdf-js-viewer__thumb-num">{{ p }}</span>
          <VuePDF
            :key="`thumb-${sourceKey}-${p}`"
            :pdf="pdf"
            :page="p"
            :width="THUMB_MAX_W"
            :auto-destroy="false"
          />
        </button>
      </div>
    </template>
    <div v-else class="pdf-js-viewer__state">
      No PDF loaded.
    </div>
  </div>
</template>

<style scoped>
/*
 * VuePDF root uses class "page" — global ledger.css sets .page { display:none }.
 * Override inside our viewer so the canvas is visible.
 */
.pdf-js-viewer__page-shell :deep(.page),
.pdf-js-viewer__thumb :deep(.page) {
  display: block !important;
  padding: 0 !important;
  width: 100%;
}

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
  padding: 0.35rem 0.5rem 0.5rem;
  display: flex;
  flex-direction: column;
  align-items: stretch;
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
  width: 100%;
  box-shadow: 0 4px 24px rgba(0, 0, 0, 0.35);
  border-radius: 2px;
  overflow: hidden;
  line-height: 0;
  flex-shrink: 0;
}

.pdf-js-viewer__page-shell :deep(canvas) {
  display: block;
  max-width: 100%;
  height: auto;
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

.pdf-js-viewer__thumb :deep(canvas) {
  display: block;
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
  padding: 0 0.5rem;
  border-radius: 10px;
  border: 1px solid #5c5c5c;
  background: rgba(255, 255, 255, 0.1);
  color: #fff;
  font-size: 12px;
  font-weight: 700;
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
    padding: 0.2rem 0.25rem 0.3rem;
  }
}
</style>
