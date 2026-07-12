<script setup lang="ts">
/**
 * PDF canvas viewer using @tato30/vue-pdf.
 * @see https://github.com/TaTo30/vue-pdf
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
const loadError = ref('')
const currentPage = ref(1)
const hostRef = ref<HTMLElement | null>(null)
const hostWidth = ref(0)
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
const loading = computed(() => Boolean(pdfSource.value) && !pdf.value && !loadError.value)
const renderWidth = computed(() => {
  if (hostWidth.value <= 0) return 0
  return Math.max(80, Math.floor(hostWidth.value * zoomMult.value))
})

const THUMB_MAX_W = 72

function updateLayoutNarrow() {
  layoutNarrow.value = typeof window !== 'undefined'
    && window.matchMedia('(max-width: 640px)').matches
}

function measureHost() {
  hostWidth.value = hostRef.value?.clientWidth ?? 0
}

function teardownResizeObserver() {
  resizeObs?.disconnect()
  resizeObs = null
}

function setupResizeObserver() {
  teardownResizeObserver()
  const host = hostRef.value
  if (!host || typeof ResizeObserver === 'undefined') return
  resizeObs = new ResizeObserver(() => measureHost())
  resizeObs.observe(host)
}

async function loadSource() {
  loadError.value = ''
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

  await nextTick()
  measureHost()
  setupResizeObserver()
}

function selectPage(p: number) {
  if (p < 1 || p > numPages.value) return
  currentPage.value = p
}

watch(() => [props.src, props.blob] as const, () => {
  currentPage.value = 1
  void loadSource()
}, { immediate: true })

watch(zoomMult, () => measureHost())

watch(pdf, async (task) => {
  if (!task) return
  currentPage.value = 1
  await nextTick()
  measureHost()
})

function onWindowResize() {
  updateLayoutNarrow()
  measureHost()
}

onMounted(() => {
  updateLayoutNarrow()
  measureHost()
  window.addEventListener('resize', onWindowResize)
})

onUnmounted(() => {
  window.removeEventListener('resize', onWindowResize)
  teardownResizeObserver()
  pdfSource.value = undefined
})

defineExpose({
  currentPage,
  numPages,
  reload: () => void loadSource(),
  refit: () => {
    measureHost()
  },
})
</script>

<template>
  <div class="pdf-viewer">
    <div v-if="loadError" class="pdf-viewer__state pdf-viewer__state--err">
      {{ loadError }}
    </div>
    <template v-else-if="pdfSource">
      <div ref="hostRef" class="pdf-viewer__host">
        <div v-if="loading" class="pdf-viewer__loading" role="status" aria-live="polite">
          Loading PDF…
        </div>
        <VuePDF
          v-if="pdf && renderWidth > 0"
          :pdf="pdf"
          :page="currentPage"
          :width="renderWidth"
          :auto-destroy="false"
        />
      </div>
      <div
        v-if="pdf && numPages > 1 && layoutNarrow"
        class="pdf-viewer__pager"
        role="navigation"
        aria-label="PDF pages"
      >
        <button
          type="button"
          class="pdf-viewer__pager-btn"
          :disabled="currentPage <= 1"
          @click="selectPage(currentPage - 1)"
        >
          Prev
        </button>
        <span class="pdf-viewer__pager-label">{{ currentPage }} / {{ numPages }}</span>
        <button
          type="button"
          class="pdf-viewer__pager-btn"
          :disabled="currentPage >= numPages"
          @click="selectPage(currentPage + 1)"
        >
          Next
        </button>
      </div>
      <div
        v-if="pdf && numPages > 1 && !layoutNarrow"
        class="pdf-viewer__thumbs"
        role="tablist"
        aria-label="Pages"
      >
        <button
          v-for="p in numPages"
          :key="p"
          type="button"
          role="tab"
          :aria-selected="p === currentPage"
          class="pdf-viewer__thumb"
          :class="{ 'pdf-viewer__thumb--on': p === currentPage }"
          :title="`Page ${p}`"
          @click="selectPage(p)"
        >
          <span class="pdf-viewer__thumb-num">{{ p }}</span>
          <VuePDF
            :pdf="pdf"
            :page="p"
            :width="THUMB_MAX_W"
            :auto-destroy="false"
          />
        </button>
      </div>
    </template>
    <div v-else class="pdf-viewer__state">No PDF loaded.</div>
  </div>
</template>

<style scoped>
.pdf-viewer {
  flex: 1 1 auto;
  min-height: 0;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  background: #525659;
}

.pdf-viewer__state {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 1rem;
  font-size: 13px;
  color: #d1d5db;
}

.pdf-viewer__state--err {
  color: #fca5a5;
  text-align: center;
}

.pdf-viewer__host {
  flex: 1 1 0;
  min-height: 0;
  width: 100%;
  position: relative;
  overflow: auto;
  -webkit-overflow-scrolling: touch;
  padding: 0.35rem 0.5rem;
  display: flex;
  flex-direction: column;
  align-items: center;
}

.pdf-viewer__loading {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 2;
  font-size: 13px;
  color: #e5e7eb;
  background: rgba(64, 64, 64, 0.5);
}

.pdf-viewer__host :deep(.page) {
  box-shadow: 0 4px 24px rgba(0, 0, 0, 0.35);
  border-radius: 2px;
  overflow: hidden;
}

.pdf-viewer__host :deep(canvas) {
  display: block;
  max-width: 100%;
  height: auto;
}

.pdf-viewer__thumbs {
  flex-shrink: 0;
  display: flex;
  gap: 0.4rem;
  padding: 0.35rem 0.4rem calc(0.4rem + env(safe-area-inset-bottom, 0));
  overflow-x: auto;
  border-top: 1px solid #484848;
  background: #404040;
}

.pdf-viewer__thumb {
  position: relative;
  flex: 0 0 auto;
  padding: 0.2rem;
  border-radius: 8px;
  border: 2px solid transparent;
  background: rgba(255, 255, 255, 0.08);
  cursor: pointer;
}

.pdf-viewer__thumb--on {
  border-color: #4f46e5;
}

.pdf-viewer__thumb-num {
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

.pdf-viewer__pager {
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 0.75rem;
  padding: 0.45rem 0.65rem calc(0.5rem + env(safe-area-inset-bottom, 0));
  border-top: 1px solid #484848;
  background: #404040;
}

.pdf-viewer__pager-label {
  font-size: 13px;
  font-weight: 700;
  color: #f3f4f6;
}

.pdf-viewer__pager-btn {
  min-width: 44px;
  min-height: 44px;
  padding: 0 0.5rem;
  border-radius: 10px;
  border: 1px solid #5c5c5c;
  background: rgba(255, 255, 255, 0.1);
  color: #fff;
  font-size: 12px;
  font-weight: 700;
  cursor: pointer;
}

.pdf-viewer__pager-btn:disabled {
  opacity: 0.35;
}
</style>
