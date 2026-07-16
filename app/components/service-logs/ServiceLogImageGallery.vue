<script setup lang="ts">
import type { ServiceLogPhotoFile } from '~/composables/useServiceLogPhotoPreviews'
import { useImageZoomPan } from '~/composables/useImageZoomPan'

const props = withDefaults(defineProps<{
  serviceLogId: string
  files: ServiceLogPhotoFile[]
  modelValue?: number
  compact?: boolean
  editable?: boolean
  deleteBusy?: boolean
  zoomable?: boolean
}>(), {
  modelValue: 0,
  compact: false,
  editable: false,
  deleteBusy: false,
  zoomable: true,
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

const displayErrors = ref(new Set<string>())
const stageRef = ref<HTMLElement | null>(null)
const zoomEnabled = computed(() => props.zoomable && !props.compact)

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
      >
        <button type="button" class="btn sm sl-gallery__zoom-btn" aria-label="Zoom out" @click="zoomOut">−</button>
        <span class="sl-gallery__zoom-pct" aria-live="polite">{{ zoomPercent }}%</span>
        <button type="button" class="btn sm sl-gallery__zoom-btn" aria-label="Zoom in" @click="zoomIn">+</button>
        <button type="button" class="btn sm sl-gallery__zoom-reset" @click="resetView">Reset</button>
        <span class="sl-gallery__zoom-hint">Scroll to zoom · drag to pan</span>
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
          :style="zoomEnabled ? transformStyle : undefined"
        >
          <img
            :key="activeFile.id"
            :src="activePreview"
            :alt="activeFile.originalFilename"
            class="sl-gallery__img"
            draggable="false"
            @error="onImageError(activeFile.id)"
          >
        </div>
      </div>

      <div class="sl-gallery__footer">
        <button
          type="button"
          class="btn sm sl-gallery__nav"
          aria-label="Previous photo"
          :disabled="!hasMultiple || anyLoading"
          @click="goPrev"
        >
          ‹ Previous
        </button>
        <div class="sl-gallery__meta">
          <span class="sl-gallery__count">Photo {{ activeIndex + 1 }} of {{ imageFiles.length }}</span>
          <span v-if="activeFile" class="sl-gallery__name">{{ activeFile.originalFilename }}</span>
        </div>
        <button
          v-if="editable"
          type="button"
          class="btn sm sl-gallery__delete"
          :disabled="deleteBusy || anyLoading"
          @click="emit('delete')"
        >
          {{ deleteBusy ? 'Removing…' : 'Remove' }}
        </button>
        <button
          type="button"
          class="btn sm sl-gallery__nav"
          aria-label="Next photo"
          :disabled="!hasMultiple || anyLoading"
          @click="goNext"
        >
          Next ›
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
  gap: 14px;
  outline: none;
}

.sl-gallery__frame {
  border: 1px solid #e2e8f0;
  border-radius: 14px;
  overflow: hidden;
  background: #fff;
  box-shadow: 0 1px 3px rgba(15, 23, 42, 0.06);
}

.sl-gallery__zoombar {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
  padding: 10px 14px;
  border-bottom: 1px solid #e2e8f0;
  background: #f8fafc;
}

.sl-gallery__zoom-btn {
  min-width: 34px;
  font-size: 18px;
  line-height: 1;
  padding: 4px 10px;
}

.sl-gallery__zoom-pct {
  min-width: 48px;
  text-align: center;
  font-size: 12px;
  font-weight: 700;
  color: #334155;
  font-variant-numeric: tabular-nums;
}

.sl-gallery__zoom-reset {
  margin-left: 2px;
}

.sl-gallery__zoom-hint {
  margin-left: auto;
  font-size: 11px;
  color: #94a3b8;
}

.sl-gallery__stage {
  background: linear-gradient(180deg, #f8fafc 0%, #f1f5f9 100%);
  min-height: 300px;
  height: min(58vh, 520px);
  display: grid;
  place-items: center;
  padding: 16px;
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
  padding: 12px;
  cursor: default;
  touch-action: auto;
}

.sl-gallery__zoom-wrap {
  display: grid;
  place-items: center;
  transform-origin: center center;
  will-change: transform;
}

.sl-gallery__img {
  max-width: 100%;
  max-height: 480px;
  width: auto;
  height: auto;
  object-fit: contain;
  display: block;
  border-radius: 8px;
  box-shadow: 0 8px 24px rgba(15, 23, 42, 0.12);
  pointer-events: none;
}

.sl-gallery--compact .sl-gallery__img {
  max-height: 360px;
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
  display: grid;
  grid-template-columns: auto 1fr auto auto;
  gap: 12px;
  align-items: center;
  padding: 12px 14px;
  border-top: 1px solid #e2e8f0;
  background: #fff;
}

.sl-gallery__meta {
  text-align: center;
  min-width: 0;
}

.sl-gallery__count {
  display: block;
  font-size: 13px;
  font-weight: 700;
  color: #0f172a;
}

.sl-gallery__name {
  display: block;
  margin-top: 2px;
  font-size: 11px;
  color: #64748b;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.sl-gallery__nav {
  white-space: nowrap;
}

.sl-gallery__delete {
  color: #dc2626;
  border-color: #fecaca;
  white-space: nowrap;
}

.sl-gallery__delete:hover:not(:disabled) {
  background: #fef2f2;
  border-color: #fca5a5;
}

.sl-gallery__thumbs {
  display: flex;
  gap: 10px;
  flex-wrap: wrap;
}

.sl-gallery__thumb {
  width: 72px;
  height: 72px;
  padding: 0;
  border: 2px solid #e2e8f0;
  border-radius: 10px;
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
  font-size: 14px;
  font-weight: 600;
  color: #94a3b8;
}

@media (max-width: 640px) {
  .sl-gallery__zoom-hint {
    width: 100%;
    margin-left: 0;
  }

  .sl-gallery__footer {
    grid-template-columns: 1fr 1fr;
    text-align: center;
  }

  .sl-gallery__meta {
    grid-column: 1 / -1;
  }

  .sl-gallery__nav,
  .sl-gallery__delete {
    width: 100%;
  }

  .sl-gallery__stage {
    min-height: 220px;
    height: 44vh;
  }
}
</style>
