<script setup lang="ts">
import type { ServiceLogPhotoFile } from '~/composables/useServiceLogPhotoPreviews'
import { useImageZoomPan } from '~/composables/useImageZoomPan'
import type { ExtractionCheckMark } from '~/utils/ai-ui'

const props = withDefaults(defineProps<{
  serviceLogId: string
  files: ServiceLogPhotoFile[]
  modelValue?: number
  compact?: boolean
  editable?: boolean
  deleteBusy?: boolean
  zoomable?: boolean
  checkMarks?: ExtractionCheckMark[]
}>(), {
  modelValue: 0,
  compact: false,
  editable: false,
  deleteBusy: false,
  zoomable: true,
  checkMarks: () => [],
})

const emit = defineEmits<{
  'update:modelValue': [index: number]
  delete: []
}>()

const serviceLogIdRef = computed(() => props.serviceLogId)
const filesRef = computed(() => props.files)

const { previewUrl, isLoading, hasError, anyLoading } = useServiceLogPhotoPreviews(serviceLogIdRef, filesRef)

const imageFiles = computed(() => props.files.filter(f => f.mimeType.startsWith('image/')))

const activeIndex = computed({
  get: () => props.modelValue,
  set: (value: number) => emit('update:modelValue', value),
})

watch(imageFiles, (imgs) => {
  if (!imgs.length) {
    activeIndex.value = 0
    return
  }
  if (activeIndex.value >= imgs.length) activeIndex.value = imgs.length - 1
}, { immediate: true })

const activeFile = computed(() => imageFiles.value[activeIndex.value] ?? null)
const activePreview = computed(() => (activeFile.value ? previewUrl(activeFile.value.id) : ''))
const hasMultiple = computed(() => imageFiles.value.length > 1)
const activeCheckMarks = computed(() => {
  const fileId = activeFile.value?.id
  if (!fileId) return [] as ExtractionCheckMark[]
  return (props.checkMarks ?? []).filter(mark =>
    mark.fileId === fileId
    && Number.isFinite(mark.x)
    && Number.isFinite(mark.y)
    && mark.x >= 0 && mark.x <= 1
    && mark.y >= 0 && mark.y <= 1,
  )
})

const displayErrors = ref(new Set<string>())
const stageRef = ref<HTMLElement | null>(null)
const imageRef = ref<HTMLImageElement | null>(null)
const stackRef = ref<HTMLElement | null>(null)
const zoomEnabled = computed(() => props.zoomable && !props.compact)
const isCoarsePointer = ref(false)

/**
 * The image fills the stage with object-fit: contain, so the element box is
 * larger than the rendered picture. Marks use normalized (0–1) picture
 * coordinates — overlay them on the actual contain-fitted content box.
 */
const naturalSize = ref<{ w: number, h: number } | null>(null)
const stackSize = ref<{ w: number, h: number }>({ w: 0, h: 0 })

function onImageLoad(event: Event) {
  const img = event.target as HTMLImageElement
  naturalSize.value = img.naturalWidth && img.naturalHeight
    ? { w: img.naturalWidth, h: img.naturalHeight }
    : null
}

const marksStyle = computed(() => {
  const n = naturalSize.value
  const b = stackSize.value
  if (!n || !b.w || !b.h) return { inset: '0' }
  const scale = Math.min(b.w / n.w, b.h / n.h)
  const w = n.w * scale
  const h = n.h * scale
  return {
    left: `${(b.w - w) / 2}px`,
    top: `${(b.h - h) / 2}px`,
    width: `${w}px`,
    height: `${h}px`,
  }
})

let stackObserver: ResizeObserver | null = null

watch(stackRef, (el) => {
  stackObserver?.disconnect()
  stackObserver = null
  if (!el || !import.meta.client) return
  stackObserver = new ResizeObserver((entries) => {
    const rect = entries[0]?.contentRect
    if (rect) stackSize.value = { w: rect.width, h: rect.height }
  })
  stackObserver.observe(el)
})

onBeforeUnmount(() => {
  stackObserver?.disconnect()
  stackObserver = null
})

const {
  zoomPercent,
  dragging,
  transformStyle,
  resetView,
  zoomIn,
  zoomOut,
  onWheel,
  onPointerDown,
  onPointerMove,
  onPointerUp,
} = useImageZoomPan(stageRef)

const zoomHint = computed(() =>
  isCoarsePointer.value
    ? 'Pinch to zoom · drag to pan'
    : 'Scroll to zoom · drag to pan',
)

onMounted(() => {
  isCoarsePointer.value = window.matchMedia('(pointer: coarse)').matches
})

watch(imageFiles, () => {
  displayErrors.value = new Set()
}, { deep: true })

watch(activeFile, () => {
  resetView()
})

function onImageError(fileId: string) {
  const next = new Set(displayErrors.value)
  next.add(fileId)
  displayErrors.value = next
}

const showLoading = computed(() =>
  !!activeFile.value && (isLoading(activeFile.value.id) || (!activePreview.value && !hasError(activeFile.value.id) && !displayErrors.value.has(activeFile.value.id))),
)

const showError = computed(() =>
  !!activeFile.value && (hasError(activeFile.value.id) || displayErrors.value.has(activeFile.value.id)),
)

function goPrev() {
  if (!imageFiles.value.length) return
  activeIndex.value = activeIndex.value <= 0
    ? imageFiles.value.length - 1
    : activeIndex.value - 1
}

function goNext() {
  if (!imageFiles.value.length) return
  activeIndex.value = activeIndex.value >= imageFiles.value.length - 1
    ? 0
    : activeIndex.value + 1
}

function selectIndex(index: number) {
  activeIndex.value = index
}

function onKeydown(event: KeyboardEvent) {
  if (!imageFiles.value.length) return
  if (event.key === 'ArrowLeft') {
    event.preventDefault()
    goPrev()
  }
  else if (event.key === 'ArrowRight') {
    event.preventDefault()
    goNext()
  }
  else if (zoomEnabled.value && (event.key === '+' || event.key === '=')) {
    event.preventDefault()
    zoomIn()
  }
  else if (zoomEnabled.value && event.key === '-') {
    event.preventDefault()
    zoomOut()
  }
  else if (zoomEnabled.value && event.key === '0') {
    event.preventDefault()
    resetView()
  }
}
</script>

<template>
  <div
    v-if="imageFiles.length"
    class="sl-gallery"
    :class="{ 'sl-gallery--compact': compact }"
    tabindex="0"
    @keydown="onKeydown"
  >
    <div class="sl-gallery__frame">
      <div
        v-if="zoomEnabled && !showLoading && !showError && activePreview"
        class="sl-gallery__zoombar"
        role="toolbar"
        aria-label="Photo zoom"
        :title="zoomHint"
      >
        <div class="sl-gallery__zoom-controls">
          <button type="button" class="sl-gallery__tool" aria-label="Zoom out" @click="zoomOut">−</button>
          <span class="sl-gallery__zoom-pct" aria-live="polite">{{ zoomPercent }}%</span>
          <button type="button" class="sl-gallery__tool" aria-label="Zoom in" @click="zoomIn">+</button>
          <button type="button" class="sl-gallery__tool sl-gallery__tool--text" @click="resetView">Reset</button>
        </div>
        <span class="sl-gallery__zoom-hint">{{ zoomHint }}</span>
      </div>

      <div
        ref="stageRef"
        class="sl-gallery__stage"
        :class="{ 'sl-gallery__stage--dragging': dragging }"
        @wheel="zoomEnabled ? onWheel($event) : undefined"
        @pointerdown="zoomEnabled ? onPointerDown($event) : undefined"
        @pointermove="zoomEnabled ? onPointerMove($event) : undefined"
        @pointerup="zoomEnabled ? onPointerUp($event) : undefined"
        @pointercancel="zoomEnabled ? onPointerUp($event) : undefined"
        @pointerleave="zoomEnabled ? onPointerUp($event) : undefined"
      >
        <p v-if="showLoading" class="sl-gallery__placeholder">Loading photo…</p>
        <p v-else-if="showError" class="sl-gallery__placeholder sl-gallery__placeholder--error">
          Could not load this photo.
        </p>
        <div
          v-else-if="activeFile && activePreview"
          class="sl-gallery__zoom-wrap"
          :class="{ 'sl-gallery__zoom-wrap--active': zoomEnabled }"
          :style="zoomEnabled ? transformStyle : undefined"
        >
          <div ref="stackRef" class="sl-gallery__img-stack">
            <img
              ref="imageRef"
              :key="activeFile.id"
              :src="activePreview"
              :alt="activeFile.originalFilename"
              class="sl-gallery__img"
              :class="{ 'sl-gallery__img--zoomable': zoomEnabled }"
              draggable="false"
              @load="onImageLoad"
              @error="onImageError(activeFile.id)"
            >
            <div
              v-if="activeCheckMarks.length"
              class="sl-gallery__marks"
              :style="marksStyle"
              aria-label="Parsed checklist marks from AI extraction"
            >
              <span
                v-for="(mark, markIndex) in activeCheckMarks"
                :key="`${mark.fileId}-${markIndex}-${mark.matchedSheetItemId || mark.description || ''}`"
                class="sl-gallery__mark"
                :style="{ left: `${mark.x * 100}%`, top: `${mark.y * 100}%` }"
                :title="mark.description || 'Parsed check'"
              >
                <span class="sl-gallery__mark-icon" aria-hidden="true">✓</span>
                <span class="sr-only">{{ mark.description || 'Parsed check' }}</span>
              </span>
            </div>
          </div>
        </div>
      </div>

      <div class="sl-gallery__footer">
        <div class="sl-gallery__footer-top">
          <button
            type="button"
            class="sl-gallery__nav"
            aria-label="Previous photo"
            :disabled="!hasMultiple || anyLoading"
            @click="goPrev"
          >
            <span aria-hidden="true">‹</span>
          </button>

          <div class="sl-gallery__meta">
            <span class="sl-gallery__count">{{ activeIndex + 1 }} / {{ imageFiles.length }}</span>
            <span v-if="activeFile" class="sl-gallery__name">{{ activeFile.originalFilename }}</span>
          </div>

          <button
            type="button"
            class="sl-gallery__nav"
            aria-label="Next photo"
            :disabled="!hasMultiple || anyLoading"
            @click="goNext"
          >
            <span aria-hidden="true">›</span>
          </button>
        </div>

        <button
          v-if="editable"
          type="button"
          class="sl-gallery__delete"
          :disabled="deleteBusy || anyLoading"
          @click="emit('delete')"
        >
          {{ deleteBusy ? 'Removing…' : 'Remove' }}
        </button>
      </div>
    </div>

    <div
      v-if="hasMultiple && !compact"
      class="sl-gallery__thumbs"
      role="tablist"
      aria-label="Photo thumbnails"
    >
      <button
        v-for="(file, index) in imageFiles"
        :key="file.id"
        type="button"
        class="sl-gallery__thumb"
        :class="{ on: index === activeIndex }"
        role="tab"
        :aria-label="`Photo ${index + 1}: ${file.originalFilename}`"
        :aria-selected="index === activeIndex"
        @click="selectIndex(index)"
      >
        <img
          v-if="previewUrl(file.id)"
          :src="previewUrl(file.id)"
          :alt="file.originalFilename"
          loading="lazy"
          draggable="false"
        >
        <span v-else class="sl-gallery__thumb-fallback">{{ index + 1 }}</span>
      </button>
    </div>
  </div>
</template>

<style scoped>
.sl-gallery {
  display: flex;
  flex-direction: column;
  gap: 10px;
  outline: none;
  min-height: 0;
  flex: 1;
}

.sl-gallery__frame {
  position: relative;
  border: 1px solid #e2e8f0;
  border-radius: 12px;
  overflow: hidden;
  background: #fff;
  box-shadow: 0 1px 3px rgba(15, 23, 42, 0.06);
  display: flex;
  flex-direction: column;
  min-height: 0;
  flex: 1;
}

.sl-gallery__zoombar {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 10px;
  border-bottom: 1px solid #e2e8f0;
  background: #f8fafc;
}

.sl-gallery__zoom-controls {
  display: inline-flex;
  align-items: center;
  gap: 4px;
}

.sl-gallery__tool {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 30px;
  min-height: 30px;
  padding: 0 8px;
  border: 1px solid #e2e8f0;
  border-radius: 8px;
  background: #fff;
  color: #0f172a;
  font: inherit;
  font-size: 15px;
  font-weight: 700;
  line-height: 1;
  cursor: pointer;
}

.sl-gallery__tool:hover {
  background: #f1f5f9;
}

.sl-gallery__tool:active {
  background: #e2e8f0;
}

.sl-gallery__tool--text {
  min-width: auto;
  font-size: 11px;
  font-weight: 650;
  letter-spacing: 0.01em;
  padding: 0 9px;
  color: #475569;
}

.sl-gallery__zoom-pct {
  min-width: 40px;
  text-align: center;
  font-size: 11px;
  font-weight: 700;
  color: #334155;
  font-variant-numeric: tabular-nums;
}

.sl-gallery__zoom-hint {
  margin-left: auto;
  font-size: 11px;
  color: #94a3b8;
}

.sl-gallery__stage {
  background: linear-gradient(180deg, #f8fafc 0%, #f1f5f9 100%);
  flex: 1 1 auto;
  min-height: 300px;
  height: min(58vh, 520px);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 12px;
  overflow: hidden;
  touch-action: none;
  cursor: grab;
  user-select: none;
}

.sl-gallery__stage--dragging {
  cursor: grabbing;
}

.sl-gallery--compact .sl-gallery__stage {
  min-height: 240px;
  height: auto;
  padding: 10px;
  cursor: default;
  touch-action: auto;
}

.sl-gallery__zoom-wrap {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 100%;
  height: 100%;
  max-width: 100%;
  max-height: 100%;
  transform-origin: center center;
  will-change: transform;
}

.sl-gallery__zoom-wrap--active {
  width: 100%;
  height: 100%;
}

/* Full-size box with a definite height: the old inline-block shrink-wrap made
   the image's max-height:100% resolve against an indefinite parent, so tall
   document photos were width-fit only and never fully visible. */
.sl-gallery__img-stack {
  position: relative;
  display: block;
  width: 100%;
  height: 100%;
  line-height: 0;
}

.sl-gallery__img {
  display: block;
  pointer-events: none;
}

.sl-gallery__marks {
  position: absolute;
  pointer-events: none;
  z-index: 2;
}

.sl-gallery__mark {
  position: absolute;
  transform: translate(-50%, -50%);
  width: 22px;
  height: 22px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 999px;
  background: rgba(22, 163, 74, 0.92);
  color: #fff;
  box-shadow: 0 0 0 2px rgba(255, 255, 255, 0.95), 0 2px 8px rgba(15, 23, 42, 0.28);
}

.sl-gallery__mark-icon {
  font-size: 13px;
  font-weight: 800;
  line-height: 1;
}

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

.sl-gallery__img--zoomable,
.sl-gallery:not(.sl-gallery--compact) .sl-gallery__img:not(.sl-gallery__img--zoomable) {
  width: 100%;
  height: 100%;
  object-fit: contain;
}

.sl-gallery--compact .sl-gallery__img-stack {
  height: auto;
}

.sl-gallery--compact .sl-gallery__img {
  max-width: 100%;
  max-height: 360px;
  width: auto;
  height: auto;
  object-fit: contain;
  border-radius: 8px;
  box-shadow: 0 8px 24px rgba(15, 23, 42, 0.12);
}

.sl-gallery__placeholder {
  margin: 0;
  font-size: 14px;
  color: #64748b;
}

.sl-gallery__placeholder--error {
  color: #dc2626;
}

.sl-gallery__footer {
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 8px 10px;
  border-top: 1px solid #e2e8f0;
  background: #fff;
}

.sl-gallery__footer-top {
  display: grid;
  grid-template-columns: auto 1fr auto;
  gap: 8px;
  align-items: center;
}

.sl-gallery__meta {
  text-align: center;
  min-width: 0;
}

.sl-gallery__count {
  display: block;
  font-size: 12px;
  font-weight: 700;
  color: #0f172a;
  font-variant-numeric: tabular-nums;
}

.sl-gallery__name {
  display: block;
  margin-top: 1px;
  font-size: 10px;
  color: #64748b;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.sl-gallery__nav {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 34px;
  height: 34px;
  padding: 0;
  border: 1px solid #e2e8f0;
  border-radius: 8px;
  background: #fff;
  color: #0f172a;
  font: inherit;
  font-size: 20px;
  font-weight: 700;
  line-height: 1;
  cursor: pointer;
}

.sl-gallery__nav:hover:not(:disabled) {
  background: #f1f5f9;
}

.sl-gallery__nav:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

.sl-gallery__delete {
  align-self: center;
  min-height: 32px;
  padding: 4px 12px;
  border: 1px solid #fecaca;
  border-radius: 8px;
  background: #fff;
  color: #dc2626;
  font: inherit;
  font-size: 12px;
  font-weight: 600;
  cursor: pointer;
  white-space: nowrap;
}

.sl-gallery__delete:hover:not(:disabled) {
  background: #fef2f2;
  border-color: #fca5a5;
}

.sl-gallery__delete:disabled {
  opacity: 0.55;
  cursor: not-allowed;
}

.sl-gallery__thumbs {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
}

.sl-gallery__thumb {
  width: 56px;
  height: 56px;
  padding: 0;
  border: 2px solid #e2e8f0;
  border-radius: 8px;
  overflow: hidden;
  background: #f8fafc;
  cursor: pointer;
  flex-shrink: 0;
}

.sl-gallery__thumb.on {
  border-color: #4f46e5;
  box-shadow: 0 0 0 2px rgba(79, 70, 229, 0.2);
}

.sl-gallery__thumb img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
}

.sl-gallery__thumb-fallback {
  display: grid;
  place-items: center;
  width: 100%;
  height: 100%;
  font-size: 13px;
  font-weight: 600;
  color: #94a3b8;
}

@media (max-width: 640px) {
  .sl-gallery {
    gap: 8px;
  }

  /* Float zoom tools over the photo so chrome doesn’t steal vertical space. */
  .sl-gallery__zoombar {
    position: absolute;
    top: 8px;
    left: 8px;
    right: 8px;
    z-index: 4;
    padding: 4px;
    border: 0;
    border-radius: 10px;
    background: rgba(255, 255, 255, 0.92);
    box-shadow: 0 2px 10px rgba(15, 23, 42, 0.14);
    backdrop-filter: blur(8px);
  }

  .sl-gallery__zoom-controls {
    width: 100%;
    justify-content: center;
    gap: 6px;
  }

  .sl-gallery__tool {
    min-width: 36px;
    min-height: 36px;
  }

  .sl-gallery__tool--text {
    min-width: auto;
  }

  .sl-gallery__zoom-hint {
    display: none;
  }

  .sl-gallery__stage {
    min-height: 280px;
    height: min(62dvh, 560px);
    padding: 8px;
  }

  .sl-gallery__footer {
    padding: 6px 8px;
    gap: 4px;
  }

  .sl-gallery__footer-top {
    gap: 6px;
  }

  .sl-gallery__nav {
    width: 36px;
    height: 36px;
    font-size: 22px;
  }

  .sl-gallery__count {
    font-size: 11px;
  }

  .sl-gallery__name {
    font-size: 10px;
  }

  .sl-gallery__delete {
    min-height: 34px;
    width: 100%;
  }

  .sl-gallery__thumb {
    width: 48px;
    height: 48px;
  }
}
</style>
