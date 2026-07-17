<script setup lang="ts">
import { filePreviewUrl } from '#shared/files'
import { FILE_DOCUMENT_CATEGORY_LABELS, type FileDocumentCategory } from '#shared/document-categories'

export interface EntityDocumentMeta {
  id: string
  originalFilename: string
  mimeType: string
  fileSizeBytes: number
  createdAt: string
  documentCategory?: string | null
}

const props = defineProps<{
  title: string
  description?: string
  category: FileDocumentCategory
  document: EntityDocumentMeta | null
  uploadUrl: string
  canUpload?: boolean
  accept?: string
}>()

const emit = defineEmits<{ uploaded: [] }>()

const busy = ref(false)
const error = ref('')
const fileInput = ref<HTMLInputElement | null>(null)

const acceptTypes = computed(() => props.accept ?? 'application/pdf,image/jpeg,image/png,image/webp,image/heic,image/heif')
const previewHref = computed(() => props.document ? filePreviewUrl(props.document.id) : null)
const isImage = computed(() => props.document?.mimeType.startsWith('image/') ?? false)

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}

async function onFilePicked(event: Event) {
  if (!props.canUpload || busy.value) return
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  input.value = ''
  if (!file) return

  busy.value = true
  error.value = ''
  try {
    const body = new FormData()
    body.append('file', file, file.name)
    await $fetch(props.uploadUrl, { method: 'POST', body })
    emit('uploaded')
  }
  catch (e: unknown) {
    error.value = (e as { data?: { message?: string } })?.data?.message ?? 'Upload failed'
  }
  finally {
    busy.value = false
  }
}
</script>

<template>
  <div class="entity-doc-panel card">
    <div class="cbody">
      <header class="entity-doc-head">
        <div>
          <h4>{{ title }}</h4>
          <p v-if="description" class="entity-doc-desc">{{ description }}</p>
          <p v-else class="entity-doc-desc">{{ FILE_DOCUMENT_CATEGORY_LABELS[category] }}</p>
        </div>
        <button
          v-if="canUpload"
          type="button"
          class="btn sm"
          :disabled="busy"
          @click="fileInput?.click()"
        >
          {{ document ? 'Replace' : 'Upload' }}
        </button>
      </header>

      <input
        ref="fileInput"
        type="file"
        class="entity-doc-file-input"
        :accept="acceptTypes"
        @change="onFilePicked"
      >

      <div v-if="document" class="entity-doc-preview">
        <a
          v-if="isImage && previewHref"
          :href="previewHref"
          target="_blank"
          rel="noopener noreferrer"
          class="entity-doc-thumb-link"
        >
          <img :src="previewHref" :alt="document.originalFilename" class="entity-doc-thumb">
        </a>
        <div class="entity-doc-meta">
          <a
            v-if="previewHref"
            :href="previewHref"
            target="_blank"
            rel="noopener noreferrer"
            class="entity-doc-name"
          >
            {{ document.originalFilename }}
          </a>
          <span v-else class="entity-doc-name">{{ document.originalFilename }}</span>
          <small>{{ formatSize(document.fileSizeBytes) }} · {{ new Date(document.createdAt).toLocaleDateString() }}</small>
        </div>
      </div>
      <p v-else class="entity-doc-empty">No document uploaded yet.</p>

      <p v-if="error" class="entity-doc-error">{{ error }}</p>
      <p v-if="busy" class="entity-doc-busy">Uploading…</p>
    </div>
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

.entity-doc-file-input {
  display: none;
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

.entity-doc-thumb-link {
  flex-shrink: 0;
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

.entity-doc-meta {
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.entity-doc-name {
  font-size: 13px;
  font-weight: 600;
  color: #4338ca;
  text-decoration: none;
  word-break: break-word;
}

.entity-doc-name:hover {
  text-decoration: underline;
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

.entity-doc-error {
  margin: 8px 0 0;
  color: #b91c1c;
  font-size: 12.5px;
  font-weight: 600;
}

.entity-doc-busy {
  margin: 8px 0 0;
  color: #64748b;
  font-size: 12.5px;
}
</style>
