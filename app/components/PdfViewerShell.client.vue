<script setup lang="ts">
/**
 * TripBuddy-style PDF chrome — title, zoom controls, download, optional close.
 * Wraps the shared PdfViewer canvas component so every surface looks identical.
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
  /** Fill parent flex column (modals, panels). */
  fill?: boolean
  /** Hide title row on narrow screens (e.g. when context already shows the label). */
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

const ZOOM_MIN_DESKTOP = 0.55
const ZOOM_MIN_MOBILE = 0.85
const ZOOM_MAX = 2.6
const zoomMult = ref(1)
const layoutNarrow = ref(false)

const zoomMin = computed(() => layoutNarrow.value ? ZOOM_MIN_MOBILE : ZOOM_MIN_DESKTOP)

const displayTitle = computed(() => props.title ?? 'PDF document')

function bumpZoom(delta: number) {
  zoomMult.value = Math.min(
    ZOOM_MAX,
    Math.max(zoomMin.value, Math.round((zoomMult.value + delta) * 100) / 100),
  )
}

function resetZoom() {
  zoomMult.value = 1
}

async function onFitPage() {
  resetZoom()
  await viewerRef.value?.refit?.()
}

const viewerRef = ref<InstanceType<typeof PdfViewerCore> | null>(null)

function updateLayoutNarrow() {
  const narrow = typeof window !== 'undefined'
    && window.matchMedia('(max-width: 640px)').matches
  if (narrow && !layoutNarrow.value && zoomMult.value < 1) {
    zoomMult.value = 1
  }
  layoutNarrow.value = narrow
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
  <div
    class="pdf-shell"
    :class="{
      'pdf-shell--fill': fill,
    }"
  >
    <header
      class="pdf-shell__head"
      :class="{
        'pdf-shell__head--narrow': layoutNarrow,
        'pdf-shell__head--compact': layoutNarrow && compact,
      }"
    >
      <h3 v-if="!(layoutNarrow && compact)" class="pdf-shell__title">{{ displayTitle }}</h3>
      <div
        class="pdf-shell__controls"
        :class="{ 'pdf-shell__controls--narrow': layoutNarrow }"
      >
        <div class="pdf-shell__zoom" role="toolbar" aria-label="PDF zoom">
          <button
            type="button"
            class="pdf-shell__zbtn"
            aria-label="Zoom out"
            @click="bumpZoom(-0.15)"
          >
            −
          </button>
          <span class="pdf-shell__zpct">{{ Math.round(zoomMult * 100) }}%</span>
          <button
            type="button"
            class="pdf-shell__zbtn"
            aria-label="Zoom in"
            @click="bumpZoom(0.15)"
          >
            +
          </button>
          <button type="button" class="pdf-shell__zfit" @click="onFitPage">
            Fit page
          </button>
        </div>
        <div class="pdf-shell__actions">
          <a
            v-if="showDownload && downloadHref"
            class="pdf-shell__download"
            :href="downloadHref"
            :download="downloadFilename"
          >{{ layoutNarrow ? 'Download' : 'Download PDF' }}</a>
          <button
            v-else-if="showDownload"
            type="button"
            class="pdf-shell__download"
            @click="emit('download')"
          >
            {{ layoutNarrow ? 'Download' : 'Download PDF' }}
          </button>
          <button
            v-if="showClose"
            type="button"
            class="pdf-shell__close"
            @click="emit('close')"
          >
            Close
          </button>
        </div>
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
  border: 1px solid #e2e8f0;
  border-radius: 14px;
  background: #fff;
  box-shadow: 0 8px 24px -12px rgba(15, 23, 42, 0.18);
}

.pdf-shell--fill {
  flex: 1;
  min-height: 0;
}

.pdf-shell__head {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 0.45rem 0.65rem;
  padding: 0.55rem 0.75rem;
  border-bottom: 1px solid #e2e8f0;
  background: linear-gradient(180deg, #fff 0%, #f8fafc 100%);
}

.pdf-shell__head--narrow {
  align-items: stretch;
}

.pdf-shell__head--narrow .pdf-shell__title {
  flex-basis: 100%;
}

.pdf-shell__head--compact {
  padding-top: 0.4rem;
  padding-bottom: 0.4rem;
}

.pdf-shell__head--compact .pdf-shell__controls {
  width: 100%;
}

.pdf-shell__title {
  margin: 0;
  flex: 1 1 10rem;
  min-width: 0;
  font-size: 13px;
  font-weight: 700;
  line-height: 1.35;
  color: #0f172a;
}

.pdf-shell__controls {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: flex-end;
  gap: 0.35rem 0.45rem;
  flex: 1 1 auto;
  min-width: 0;
}

.pdf-shell__controls--narrow {
  width: 100%;
  justify-content: space-between;
}

.pdf-shell__actions {
  display: inline-flex;
  align-items: center;
  gap: 0.35rem;
  margin-left: auto;
  flex-shrink: 0;
}

.pdf-shell__controls--narrow .pdf-shell__actions {
  margin-left: 0;
}

.pdf-shell__zoom {
  display: inline-flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 0.2rem;
}

.pdf-shell__zbtn {
  min-width: 36px;
  min-height: 36px;
  padding: 0;
  border-radius: 8px;
  font-size: 1.1rem;
  font-weight: 700;
  line-height: 1;
  border: 1px solid #e2e8f0;
  background: #fff;
  color: #0f172a;
  cursor: pointer;
  touch-action: manipulation;
}

.pdf-shell__zbtn:hover {
  background: #f1f5f9;
}

.pdf-shell__zbtn:focus-visible {
  outline: 2px solid #818cf8;
  outline-offset: 2px;
}

.pdf-shell__zfit {
  min-height: 36px;
  padding: 0 0.55rem;
  border-radius: 8px;
  font-size: 11px;
  font-weight: 600;
  border: 1px solid #e2e8f0;
  background: #fff;
  color: #334155;
  cursor: pointer;
  touch-action: manipulation;
}

.pdf-shell__zfit:hover {
  background: #f1f5f9;
}

.pdf-shell__zfit:focus-visible {
  outline: 2px solid #818cf8;
  outline-offset: 2px;
}

.pdf-shell__zpct {
  min-width: 2.65rem;
  text-align: center;
  font-size: 11px;
  font-weight: 700;
  font-variant-numeric: tabular-nums;
  color: #475569;
}

.pdf-shell__download {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 0.38rem 0.75rem;
  border-radius: 8px;
  font-size: 11px;
  font-weight: 700;
  text-decoration: none;
  color: #fff;
  background: linear-gradient(145deg, #6366f1, #4f46e5);
  border: 1px solid #4338ca;
  cursor: pointer;
  touch-action: manipulation;
}

.pdf-shell__download:hover {
  filter: brightness(1.05);
}

.pdf-shell__close {
  padding: 0.38rem 0.7rem;
  border-radius: 8px;
  font-size: 11px;
  font-weight: 600;
  border: 1px solid #e2e8f0;
  background: #fff;
  color: #334155;
  cursor: pointer;
  touch-action: manipulation;
}

.pdf-shell__close:hover {
  background: #f1f5f9;
}

.pdf-shell__frame {
  flex: 1 1 auto;
  min-height: min(72vh, 820px);
  display: flex;
  flex-direction: column;
  overflow: hidden;
  background: #525659;
}

.pdf-shell--fill .pdf-shell__frame {
  flex: 1;
  min-height: min(60vh, 720px);
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
  background: #525659;
}

@media (max-width: 640px) {
  .pdf-shell {
    min-height: 0;
    flex: 1 1 auto;
  }

  .pdf-shell__head {
    padding: 0.35rem 0.45rem;
  }

  .pdf-shell__frame {
    flex: 1 1 auto;
    min-height: 0;
  }

  .pdf-shell--fill {
    min-height: 0;
    flex: 1 1 auto;
  }

  .pdf-shell--fill .pdf-shell__frame {
    flex: 1;
    min-height: 0;
  }

  .pdf-shell__zbtn,
  .pdf-shell__zfit {
    min-width: 44px;
    min-height: 44px;
  }

  .pdf-shell__controls--narrow .pdf-shell__download,
  .pdf-shell__controls--narrow .pdf-shell__close {
    min-height: 44px;
    font-size: 12px;
    padding-inline: 0.55rem;
  }
}
</style>
