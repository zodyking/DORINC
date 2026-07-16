<script setup lang="ts">
import { filePreviewUrl } from '#shared/files'

export interface GalleryFile {
  id: string
  originalFilename: string
  mimeType: string
}

const props = withDefaults(defineProps<{
  files: GalleryFile[]
  /** v-model for the active image index */
  modelValue?: number
  compact?: boolean
}>(), {
  modelValue: 0,
  compact: false,
})

const emit = defineEmits<{
  'update:modelValue': [index: number]
}>()

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
const hasMultiple = computed(() => imageFiles.value.length > 1)
const imageLoading = ref(false)
const imageError = ref(false)

watch(activeFile, () => {
  imageLoading.value = !!activeFile.value
  imageError.value = false
}, { immediate: true })

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

function onImageLoad() {
  imageLoading.value = false
  imageError.value = false
}

function onImageError() {
  imageLoading.value = false
  imageError.value = true
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
    <div class="sl-gallery__toolbar">
      <span class="sl-gallery__count">{{ activeIndex + 1 }} of {{ imageFiles.length }}</span>
      <span v-if="activeFile" class="sl-gallery__name">{{ activeFile.originalFilename }}</span>
    </div>

    <div class="sl-gallery__viewer">
      <button
        type="button"
        class="sl-gallery__arrow"
        aria-label="Previous image"
        :disabled="!hasMultiple"
        @click="goPrev"
      >
        ‹
      </button>

      <div class="sl-gallery__stage">
        <div v-if="imageLoading && !imageError" class="sl-gallery__state">Loading image…</div>
        <div v-if="imageError" class="sl-gallery__state sl-gallery__state--error">
          Could not load this image.
        </div>
        <img
          v-if="activeFile"
          :key="activeFile.id"
          :src="filePreviewUrl(activeFile.id)"
          :alt="activeFile.originalFilename"
          class="sl-gallery__img"
          :class="{ 'sl-gallery__img--hidden': imageError }"
          @load="onImageLoad"
          @error="onImageError"
        >
      </div>

      <button
        type="button"
        class="sl-gallery__arrow"
        aria-label="Next image"
        :disabled="!hasMultiple"
        @click="goNext"
      >
        ›
      </button>
    </div>

    <div v-if="hasMultiple && !compact" class="sl-gallery__dots" role="tablist" aria-label="Photo thumbnails">
      <button
        v-for="(file, index) in imageFiles"
        :key="file.id"
        type="button"
        class="sl-gallery__dot"
        :class="{ on: index === activeIndex }"
        role="tab"
        :aria-label="`Photo ${index + 1}: ${file.originalFilename}`"
        :aria-selected="index === activeIndex"
        @click="selectIndex(index)"
      />
    </div>

    <div v-if="hasMultiple && !compact" class="sl-gallery__thumbs photos">
      <button
        v-for="(file, index) in imageFiles"
        :key="file.id"
        type="button"
        class="photo sl-gallery__thumb"
        :class="{ on: index === activeIndex }"
        :aria-label="`View image ${index + 1}: ${file.originalFilename}`"
        :aria-current="index === activeIndex ? 'true' : undefined"
        @click="selectIndex(index)"
      >
        <img :src="filePreviewUrl(file.id)" :alt="file.originalFilename" loading="lazy">
      </button>
    </div>
  </div>
</template>

<style scoped>
.sl-gallery {
  display: flex;
  flex-direction: column;
  gap: 12px;
  outline: none;
}

.sl-gallery__toolbar {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 12px;
  flex-wrap: wrap;
}

.sl-gallery__count {
  font-size: 12px;
  font-weight: 700;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  color: #4f46e5;
}

.sl-gallery__name {
  font-size: 12px;
  color: #64748b;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.sl-gallery__viewer {
  display: grid;
  grid-template-columns: auto 1fr auto;
  gap: 8px;
  align-items: center;
}

.sl-gallery__arrow {
  width: 40px;
  height: 40px;
  border: 1px solid #e2e8f0;
  border-radius: 999px;
  background: #fff;
  color: #334155;
  font-size: 22px;
  line-height: 1;
  cursor: pointer;
  display: grid;
  place-items: center;
  flex-shrink: 0;
  transition: background 0.15s, border-color 0.15s, opacity 0.15s;
}

.sl-gallery__arrow:hover:not(:disabled) {
  background: #f8fafc;
  border-color: #cbd5e1;
}

.sl-gallery__arrow:disabled {
  opacity: 0.35;
  cursor: default;
}

.sl-gallery__stage {
  position: relative;
  background: #f8fafc;
  border: 1px solid #e2e8f0;
  border-radius: 12px;
  overflow: hidden;
  min-height: 280px;
  display: grid;
  place-items: center;
}

.sl-gallery--compact .sl-gallery__stage {
  min-height: 220px;
}

.sl-gallery__img {
  width: 100%;
  max-height: 520px;
  object-fit: contain;
  display: block;
}

.sl-gallery--compact .sl-gallery__img {
  max-height: 380px;
}

.sl-gallery__img--hidden {
  visibility: hidden;
  position: absolute;
}

.sl-gallery__state {
  position: absolute;
  inset: 0;
  display: grid;
  place-items: center;
  font-size: 13px;
  color: #64748b;
  padding: 16px;
  text-align: center;
}

.sl-gallery__state--error {
  color: #dc2626;
}

.sl-gallery__dots {
  display: flex;
  justify-content: center;
  gap: 8px;
  flex-wrap: wrap;
}

.sl-gallery__dot {
  width: 8px;
  height: 8px;
  border-radius: 999px;
  border: none;
  padding: 0;
  background: #cbd5e1;
  cursor: pointer;
}

.sl-gallery__dot.on {
  background: #4f46e5;
  transform: scale(1.15);
}

.sl-gallery__thumbs .photo {
  cursor: pointer;
  padding: 0;
  overflow: hidden;
}

.sl-gallery__thumbs .photo.on {
  outline: 3px solid #4f46e5;
  outline-offset: 2px;
}

.sl-gallery__thumbs img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

@media (max-width: 640px) {
  .sl-gallery__viewer {
    grid-template-columns: 1fr;
    gap: 10px;
  }

  .sl-gallery__arrow {
    display: none;
  }

  .sl-gallery__stage {
    min-height: 220px;
  }
}
</style>
