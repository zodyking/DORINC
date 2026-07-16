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
    <div class="sl-gallery__main">
      <img
        v-if="activeFile"
        :src="filePreviewUrl(activeFile.id)"
        :alt="activeFile.originalFilename"
        class="sl-gallery__img"
      >
      <div v-if="hasMultiple" class="sl-gallery__nav">
        <button type="button" class="btn sm sl-gallery__nav-btn" aria-label="Previous image" @click="goPrev">
          ‹
        </button>
        <span class="sl-gallery__counter">{{ activeIndex + 1 }} / {{ imageFiles.length }}</span>
        <button type="button" class="btn sm sl-gallery__nav-btn" aria-label="Next image" @click="goNext">
          ›
        </button>
      </div>
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
        <img :src="filePreviewUrl(file.id)" :alt="file.originalFilename">
      </button>
    </div>

    <p v-if="activeFile" class="sl-gallery__caption">{{ activeFile.originalFilename }}</p>
  </div>
</template>

<style scoped>
.sl-gallery {
  display: flex;
  flex-direction: column;
  gap: 12px;
  outline: none;
}

.sl-gallery__main {
  position: relative;
  background: #f8fafc;
  border: 1px solid #e2e8f0;
  border-radius: 12px;
  overflow: hidden;
  min-height: 240px;
  display: grid;
  place-items: center;
}

.sl-gallery--compact .sl-gallery__main {
  min-height: 200px;
}

.sl-gallery__img {
  width: 100%;
  max-height: 480px;
  object-fit: contain;
  display: block;
}

.sl-gallery--compact .sl-gallery__img {
  max-height: 360px;
}

.sl-gallery__nav {
  position: absolute;
  bottom: 12px;
  left: 50%;
  transform: translateX(-50%);
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 10px;
  background: rgba(15, 23, 42, 0.72);
  border-radius: 999px;
  color: #fff;
}

.sl-gallery__nav-btn {
  min-width: 32px;
  padding: 4px 8px;
  background: rgba(255, 255, 255, 0.12);
  border-color: transparent;
  color: #fff;
}

.sl-gallery__counter {
  font-size: 12px;
  font-weight: 600;
  min-width: 52px;
  text-align: center;
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

.sl-gallery__caption {
  margin: 0;
  font-size: 12px;
  color: #64748b;
  text-align: center;
}
</style>
