<script setup lang="ts">
import {
  FILE_DOCUMENT_CATEGORY_DESCRIPTIONS,
  FILE_DOCUMENT_CATEGORY_LABELS,
  type FileDocumentActiveCategory,
} from '#shared/document-categories'
import type { EntityDocumentMeta } from './EntityDocumentViewer.vue'

const props = defineProps<{
  title?: string
  description?: string
  category: FileDocumentActiveCategory
  document: EntityDocumentMeta | null
  uploadUrl: string
  removeUrl: string
  canManage?: boolean
  accept?: string
}>()

const emit = defineEmits<{ uploaded: [], removed: [] }>()

const busy = ref(false)
const error = ref('')
const fileInput = ref<HTMLInputElement | null>(null)

const displayTitle = computed(() => props.title ?? FILE_DOCUMENT_CATEGORY_LABELS[props.category])
const displayDescription = computed(() => props.description ?? FILE_DOCUMENT_CATEGORY_DESCRIPTIONS[props.category])
const acceptTypes = computed(() => props.accept ?? 'application/pdf,image/jpeg,image/png,image/webp,image/heic,image/heif')

async function onFilePicked(event: Event) {
  if (!props.canManage || busy.value) return
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

async function removeDocument() {
  if (!props.canManage || busy.value) return
  if (!confirm(`Remove the ${displayTitle.value.toLowerCase()} from this record?`)) return

  busy.value = true
  error.value = ''
  try {
    await $fetch(props.removeUrl, { method: 'DELETE' })
    emit('removed')
  }
  catch (e: unknown) {
    error.value = (e as { data?: { message?: string } })?.data?.message ?? 'Could not remove document'
  }
  finally {
    busy.value = false
  }
}
</script>

<template>
  <div class="entity-doc-upload card">
    <div class="cbody">
      <header class="entity-doc-head">
        <div>
          <h4>{{ displayTitle }}</h4>
          <p class="entity-doc-desc">{{ displayDescription }}</p>
        </div>
        <div v-if="canManage" class="entity-doc-actions">
          <button
            type="button"
            class="btn sm"
            :disabled="busy"
            @click="fileInput?.click()"
          >
            {{ document ? 'Replace' : 'Upload' }}
          </button>
          <button
            v-if="document"
            type="button"
            class="btn sm danger"
            :disabled="busy"
            @click="removeDocument"
          >
            Remove
          </button>
        </div>
      </header>

      <input
        ref="fileInput"
        type="file"
        class="entity-doc-file-input"
        :accept="acceptTypes"
        @change="onFilePicked"
      >

      <p v-if="document" class="entity-doc-current">
        Current file: <strong>{{ document.originalFilename }}</strong>
      </p>
      <p v-else class="entity-doc-empty">No document uploaded yet.</p>

      <p v-if="error" class="entity-doc-error">{{ error }}</p>
      <p v-if="busy" class="entity-doc-busy">{{ document ? 'Saving…' : 'Uploading…' }}</p>
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

.entity-doc-actions {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
}

.entity-doc-file-input {
  display: none;
}

.entity-doc-current {
  margin: 0;
  font-size: 13px;
  color: #475569;
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
