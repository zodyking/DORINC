<script setup lang="ts">
/**
 * PDF chrome — Acrobat-style toolbar with zoom, fit modes, page nav, download.
 */
import PdfViewerCore from '~/components/PdfViewer.client.vue'

const props = withDefaults(defineProps<{
  src?: string
  blob?: Blob | null
  title?: string
  showDownload?: boolean
  downloadHref?: string
  downloadFilename?: string
  showClose?: boolean
  fill?: boolean
  compact?: boolean
}>(), {
  showDownload: true,
  fill: false,
  compact: false,
})

const emit = defineEmits<{
  close: []
  download: []
  'load-error': [unknown]
}>()

const ZOOM_MIN = 0.35
const ZOOM_MAX = 3
const zoomMult = ref(1)
const layoutNarrow = ref(false)

const viewerRef = ref<InstanceType<typeof PdfViewerCore> | null>(null)

const pageCurrent = ref(1)
const pageTotal = ref(0)

const displayTitle = computed(() => props.title ?? 'PDF document')

const pageLabel = computed(() => {
  if (pageTotal.value <= 1) return ''
  return `${pageCurrent.value} / ${pageTotal.value}`
})

function onPageInfo(info: { current: number, total: number }) {
  pageCurrent.value = info.current
  pageTotal.value = info.total
}

function bumpZoom(delta: number) {
  zoomMult.value = Math.min(
    ZOOM_MAX,
    Math.max(ZOOM_MIN, Math.round((zoomMult.value + delta) * 100) / 100),
  )
}

function resetZoom() {
  zoomMult.value = 1
}

async function onFitPage() {
  resetZoom()
  await viewerRef.value?.refit?.()
}

function prevPage() {
  viewerRef.value?.prevPage?.()
}

function nextPage() {
  viewerRef.value?.nextPage?.()
}

function updateLayoutNarrow() {
  layoutNarrow.value = typeof window !== 'undefined'
    && window.matchMedia('(max-width: 640px)').matches
}

watch(() => [props.src, props.blob] as const, ([url, blob]) => {
  if (url || blob) {
    resetZoom()
    updateLayoutNarrow()
  }
}, { immediate: true })

onMounted(() => {
  updateLayoutNarrow()
  window.addEventListener('resize', updateLayoutNarrow)
})

onUnmounted(() => {
  window.removeEventListener('resize', updateLayoutNarrow)
})
</script>

<template>
  <div class="pdf-shell" :class="{ 'pdf-shell--fill': fill }">
    <header class="pdf-shell__toolbar">
      <div class="pdf-shell__toolbar-start">
        <span v-if="!(layoutNarrow && compact)" class="pdf-shell__title">{{ displayTitle }}</span>
        <div v-if="pageLabel" class="pdf-shell__pages" role="navigation" aria-label="PDF pages">
          <button
            type="button"
            class="pdf-shell__iconbtn"
            aria-label="Previous page"
            :disabled="pageCurrent <= 1"
            @click="prevPage"
          >
            ‹
          </button>
          <span class="pdf-shell__page-label">{{ pageLabel }}</span>
          <button
            type="button"
            class="pdf-shell__iconbtn"
            aria-label="Next page"
            :disabled="pageCurrent >= pageTotal"
            @click="nextPage"
          >
            ›
          </button>
        </div>
      </div>

      <div class="pdf-shell__toolbar-center" role="toolbar" aria-label="PDF zoom">
        <button type="button" class="pdf-shell__iconbtn" aria-label="Zoom out" @click="bumpZoom(-0.15)">
          −
        </button>
        <span class="pdf-shell__zoom-pct">{{ Math.round(zoomMult * 100) }}%</span>
        <button type="button" class="pdf-shell__iconbtn" aria-label="Zoom in" @click="bumpZoom(0.15)">
          +
        </button>
        <span class="pdf-shell__divider" aria-hidden="true" />
        <button
          type="button"
          class="pdf-shell__fitbtn"
          @click="onFitPage"
        >
          Fit page
        </button>
      </div>

      <div class="pdf-shell__toolbar-end">
        <a
          v-if="showDownload && downloadHref"
          class="pdf-shell__action pdf-shell__action--primary"
          :href="downloadHref"
          :download="downloadFilename"
        >Download</a>
        <button
          v-else-if="showDownload"
          type="button"
          class="pdf-shell__action pdf-shell__action--primary"
          @click="emit('download')"
        >
          Download
        </button>
        <button
          v-if="showClose"
          type="button"
          class="pdf-shell__action"
          @click="emit('close')"
        >
          Close
        </button>
      </div>
    </header>

    <div class="pdf-shell__frame">
      <PdfViewerCore
        ref="viewerRef"
        v-if="src || blob"
        :src="src"
        :blob="blob"
        v-model:zoom-mult="zoomMult"
        @load-error="emit('load-error', $event)"
        @page-info="onPageInfo"
      />
      <p v-else class="pdf-shell__fallback" role="status">No PDF loaded</p>
    </div>
  </div>
</template>

<style scoped>
.pdf-shell {
  display: flex;
  flex-direction: column;
  overflow: hidden;
  border: 1px solid #2a2d30;
  border-radius: 10px;
  background: #525659;
  box-shadow: 0 6px 28px rgba(0, 0, 0, 0.18);
}

.pdf-shell--fill {
  flex: 1;
  min-height: 0;
}

.pdf-shell__toolbar {
  flex-shrink: 0;
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.4rem 0.55rem;
  background: linear-gradient(180deg, #3d4044 0%, #323639 100%);
  border-bottom: 1px solid #1e1e1e;
}

.pdf-shell__toolbar-start {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  min-width: 0;
  flex: 1 1 8rem;
}

.pdf-shell__title {
  font-size: 12px;
  font-weight: 600;
  color: #e8eaed;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.pdf-shell__pages {
  display: inline-flex;
  align-items: center;
  gap: 0.15rem;
  flex-shrink: 0;
}

.pdf-shell__page-label {
  min-width: 3.25rem;
  text-align: center;
  font-size: 11px;
  font-weight: 700;
  font-variant-numeric: tabular-nums;
  color: #bdc1c6;
}

.pdf-shell__toolbar-center {
  display: inline-flex;
  align-items: center;
  gap: 0.2rem;
  flex-shrink: 0;
}

.pdf-shell__toolbar-end {
  display: inline-flex;
  align-items: center;
  gap: 0.35rem;
  margin-left: auto;
  flex-shrink: 0;
}

.pdf-shell__iconbtn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 32px;
  min-height: 32px;
  padding: 0;
  border-radius: 6px;
  font-size: 1rem;
  font-weight: 700;
  line-height: 1;
  border: 1px solid #5f6368;
  background: #474a4d;
  color: #f1f3f4;
  cursor: pointer;
  touch-action: manipulation;
}

.pdf-shell__iconbtn:disabled {
  opacity: 0.35;
  cursor: not-allowed;
}

.pdf-shell__iconbtn:hover {
  background: #5a5d61;
}

.pdf-shell__iconbtn:focus-visible {
  outline: 2px solid #818cf8;
  outline-offset: 1px;
}

.pdf-shell__zoom-pct {
  min-width: 2.75rem;
  text-align: center;
  font-size: 11px;
  font-weight: 700;
  font-variant-numeric: tabular-nums;
  color: #e8eaed;
}

.pdf-shell__divider {
  width: 1px;
  height: 22px;
  margin: 0 0.15rem;
  background: #5f6368;
}

.pdf-shell__fitbtn {
  min-height: 32px;
  padding: 0 0.55rem;
  border-radius: 6px;
  font-size: 11px;
  font-weight: 600;
  border: 1px solid #5f6368;
  background: #474a4d;
  color: #e8eaed;
  cursor: pointer;
  touch-action: manipulation;
  white-space: nowrap;
}

.pdf-shell__fitbtn:hover {
  background: #5a5d61;
}

.pdf-shell__fitbtn:focus-visible {
  outline: 2px solid #818cf8;
  outline-offset: 1px;
}

.pdf-shell__action {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-height: 32px;
  padding: 0 0.7rem;
  border-radius: 6px;
  font-size: 11px;
  font-weight: 700;
  border: 1px solid #5f6368;
  background: #474a4d;
  color: #f1f3f4;
  cursor: pointer;
  text-decoration: none;
  touch-action: manipulation;
  white-space: nowrap;
}

.pdf-shell__action:hover {
  background: #5a5d61;
}

.pdf-shell__action--primary {
  background: #4f46e5;
  border-color: #4338ca;
  color: #fff;
}

.pdf-shell__action--primary:hover {
  background: #6366f1;
}

.pdf-shell__frame {
  flex: 1 1 auto;
  min-height: min(62vh, 720px);
  display: flex;
  flex-direction: column;
  overflow: hidden;
  background: #525659;
}

.pdf-shell--fill .pdf-shell__frame {
  flex: 1;
  min-height: 0;
}

.pdf-shell__fallback {
  flex: 1;
  margin: 0;
  padding: 1rem;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 13px;
  color: #d1d5db;
}

@media (max-width: 640px) {
  .pdf-shell__toolbar {
    flex-wrap: wrap;
    padding: 0.35rem 0.4rem;
    gap: 0.35rem;
  }

  .pdf-shell__toolbar-start {
    flex: 1 1 100%;
    justify-content: space-between;
  }

  .pdf-shell__toolbar-center {
    flex: 1 1 auto;
    flex-wrap: wrap;
    justify-content: center;
  }

  .pdf-shell__toolbar-end {
    margin-left: 0;
  }

  .pdf-shell__iconbtn,
  .pdf-shell__fitbtn,
  .pdf-shell__action {
    min-height: 40px;
    min-width: 40px;
  }

  .pdf-shell__frame {
    min-height: 0;
  }

  .pdf-shell--fill .pdf-shell__frame {
    flex: 1;
    min-height: 0;
  }
}
</style>
