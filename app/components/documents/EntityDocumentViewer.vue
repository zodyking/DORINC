<script setup lang="ts">
import { filePreviewUrl } from '#shared/files'
import {
  FILE_DOCUMENT_CATEGORY_DESCRIPTIONS,
  FILE_DOCUMENT_CATEGORY_LABELS,
  type FileDocumentActiveCategory,
} from '#shared/document-categories'
import { PdfViewerDialog } from '~/utils/pdf-viewer'
import { useImageZoomPan } from '~/composables/useImageZoomPan'

export interface EntityDocumentMeta {
  id: string
  originalFilename: string
  mimeType: string
  fileSizeBytes: number
  createdAt: string
  documentCategory?: string | null
}

const props = defineProps<{
  title?: string
  description?: string
  category: FileDocumentActiveCategory
  document: EntityDocumentMeta | null
  pendingRequest?: boolean
}>()

const displayTitle = computed(() => props.title ?? FILE_DOCUMENT_CATEGORY_LABELS[props.category])
const displayDescription = computed(() => props.description ?? FILE_DOCUMENT_CATEGORY_DESCRIPTIONS[props.category])
const previewHref = computed(() => props.document ? filePreviewUrl(props.document.id) : null)
const isPdf = computed(() => props.document?.mimeType === 'application/pdf')
const isImage = computed(() => props.document?.mimeType.startsWith('image/') ?? false)

const pdfOpen = ref(false)
const imageOpen = ref(false)
const stageRef = ref<HTMLElement | null>(null)
const imageRef = ref<HTMLImageElement | null>(null)

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

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}

function openViewer() {
  if (!props.document) return
  if (isPdf.value) pdfOpen.value = true
  else if (isImage.value) imageOpen.value = true
}

watch(imageOpen, (open) => {
  if (!open) resetView()
})
</script>

<template>
  <div class="entity-doc-view card">
    <div class="cbody">
      <header class="entity-doc-head">
        <div>
          <h4>{{ displayTitle }}</h4>
          <p class="entity-doc-desc">{{ displayDescription }}</p>
          <p v-if="pendingRequest" class="entity-doc-pending">Change request pending staff review</p>
        </div>
        <button
          v-if="document"
          type="button"
          class="btn sm"
          @click="openViewer"
        >
          View document
        </button>
      </header>

      <div v-if="document" class="entity-doc-preview">
        <button
          type="button"
          class="entity-doc-open"
          @click="openViewer"
        >
          <img
            v-if="isImage && previewHref"
            :src="previewHref"
            :alt="document.originalFilename"
            class="entity-doc-thumb"
          >
          <div v-else class="entity-doc-pdf-icon" aria-hidden="true">PDF</div>
        </button>
        <div class="entity-doc-meta">
          <span class="entity-doc-name">{{ document.originalFilename }}</span>
          <small>{{ formatSize(document.fileSizeBytes) }} · {{ new Date(document.createdAt).toLocaleDateString() }}</small>
        </div>
      </div>
      <p v-else class="entity-doc-empty">No document on file.</p>
    </div>

    <PdfViewerDialog
      v-if="isPdf && previewHref"
      v-model:open="pdfOpen"
      :src="previewHref"
      :title="displayTitle"
      :download-href="previewHref"
      :download-filename="document?.originalFilename"
    />

    <Teleport to="body">
      <div
        v-if="imageOpen && isImage && previewHref"
        class="entity-doc-image-dialog"
        role="dialog"
        aria-modal="true"
        :aria-label="displayTitle"
      >
        <div class="entity-doc-image-dialog__backdrop" @click="imageOpen = false" />
        <div class="entity-doc-image-dialog__panel">
          <header class="entity-doc-image-dialog__head">
            <strong>{{ document?.originalFilename }}</strong>
            <div class="entity-doc-image-dialog__tools">
              <button type="button" class="btn sm" @click="zoomOut">−</button>
              <span class="entity-doc-image-dialog__zoom">{{ zoomPercent }}%</span>
              <button type="button" class="btn sm" @click="zoomIn">+</button>
              <button type="button" class="btn sm" @click="resetView">Reset</button>
              <button type="button" class="btn sm" @click="imageOpen = false">Close</button>
            </div>
          </header>
          <div
            ref="stageRef"
            class="entity-doc-image-dialog__stage"
            :class="{ dragging }"
            @wheel.prevent="onWheel"
            @pointerdown="onPointerDown"
            @pointermove="onPointerMove"
            @pointerup="onPointerUp"
            @pointercancel="onPointerUp"
            @pointerleave="onPointerUp"
          >
            <img
              ref="imageRef"
              :src="previewHref"
              :alt="document?.originalFilename"
              class="entity-doc-image-dialog__img"
              :style="transformStyle"
              draggable="false"
            >
          </div>
        </div>
      </div>
    </Teleport>
  </div>
</template>

<style scoped>
.entity-doc-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 12px;
}

.entity-doc-head h4 {
  margin: 0;
  font-size: 14px;
  font-weight: 700;
  color: #0f172a;
}

.entity-doc-desc {
  margin: 4px 0 0;
  font-size: 12.5px;
  color: #64748b;
  line-height: 1.45;
  max-width: 52ch;
}

.entity-doc-pending {
  margin: 6px 0 0;
  font-size: 12px;
  font-weight: 600;
  color: #b45309;
}

.entity-doc-preview {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 10px 12px;
  border: 1px solid #e2e8f0;
  border-radius: 10px;
  background: #f8fafc;
}

.entity-doc-open {
  flex-shrink: 0;
  padding: 0;
  border: 0;
  background: transparent;
  cursor: pointer;
}

.entity-doc-thumb {
  display: block;
  width: 72px;
  height: 72px;
  object-fit: cover;
  border-radius: 8px;
  border: 1px solid #e2e8f0;
  background: #fff;
}

.entity-doc-pdf-icon {
  width: 72px;
  height: 72px;
  display: grid;
  place-items: center;
  border-radius: 8px;
  border: 1px solid #e2e8f0;
  background: #fff;
  font-size: 12px;
  font-weight: 800;
  color: #4338ca;
}

.entity-doc-meta {
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.entity-doc-name {
  font-size: 13px;
  font-weight: 600;
  color: #0f172a;
  word-break: break-word;
}

.entity-doc-meta small {
  color: #64748b;
  font-size: 12px;
}

.entity-doc-empty {
  margin: 0;
  font-size: 13px;
  color: #94a3b8;
  font-style: italic;
}

.entity-doc-image-dialog {
  position: fixed;
  inset: 0;
  z-index: 10050;
  display: flex;
  align-items: stretch;
  justify-content: center;
}

.entity-doc-image-dialog__backdrop {
  position: absolute;
  inset: 0;
  background: rgba(15, 23, 42, 0.72);
}

.entity-doc-image-dialog__panel {
  position: relative;
  z-index: 1;
  display: flex;
  flex-direction: column;
  width: min(960px, 100%);
  margin: auto;
  max-height: calc(100dvh - 24px);
  background: #0f172a;
  border-radius: 12px;
  overflow: hidden;
}

.entity-doc-image-dialog__head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 10px 12px;
  color: #f8fafc;
  border-bottom: 1px solid rgba(255, 255, 255, 0.08);
}

.entity-doc-image-dialog__tools {
  display: flex;
  align-items: center;
  gap: 6px;
}

.entity-doc-image-dialog__zoom {
  min-width: 44px;
  text-align: center;
  font-size: 12px;
  color: #cbd5e1;
}

.entity-doc-image-dialog__stage {
  flex: 1;
  min-height: 320px;
  overflow: hidden;
  touch-action: none;
  cursor: grab;
}

.entity-doc-image-dialog__stage.dragging {
  cursor: grabbing;
}

.entity-doc-image-dialog__img {
  max-width: none;
  transform-origin: center center;
  user-select: none;
}
</style>
