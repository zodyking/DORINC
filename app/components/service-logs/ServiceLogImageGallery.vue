<script setup lang="ts">
import type { ServiceLogPhotoFile } from '~/composables/useServiceLogPhotoPreviews'

const props = withDefaults(defineProps<{
  serviceLogId: string
  files: ServiceLogPhotoFile[]
  modelValue?: number
  compact?: boolean
  editable?: boolean
  deleteBusy?: boolean
}>(), {
  modelValue: 0,
  compact: false,
  editable: false,
  deleteBusy: false,
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

watch(imageFiles, () => {
  displayErrors.value = new Set()
}, { deep: true })

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
      <div class="sl-gallery__stage">
        <p v-if="showLoading" class="sl-gallery__placeholder">Loading photo…</p>
        <p v-else-if="showError" class="sl-gallery__placeholder sl-gallery__placeholder--error">
          Could not load this photo.
        </p>
        <img
          v-else-if="activeFile && activePreview"
          :key="activeFile.id"
          :src="activePreview"
          :alt="activeFile.originalFilename"
          class="sl-gallery__img"
          @error="onImageError(activeFile.id)"
        >
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

.sl-gallery__stage {
  background: linear-gradient(180deg, #f8fafc 0%, #f1f5f9 100%);
  min-height: 300px;
  display: grid;
  place-items: center;
  padding: 16px;
}

.sl-gallery--compact .sl-gallery__stage {
  min-height: 240px;
  padding: 12px;
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
  }
}
</style>
