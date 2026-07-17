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
  changeRequestUrl: string
  pendingRequest?: boolean
  accept?: string
}>()

const emit = defineEmits<{ submitted: [] }>()

const displayTitle = computed(() => props.title ?? FILE_DOCUMENT_CATEGORY_LABELS[props.category])
const displayDescription = computed(() => props.description ?? FILE_DOCUMENT_CATEGORY_DESCRIPTIONS[props.category])
const acceptTypes = computed(() => props.accept ?? 'application/pdf,image/jpeg,image/png,image/webp,image/heic,image/heif')

const busy = ref(false)
const error = ref('')
const message = ref('')
const notes = ref('')
const fileInput = ref<HTMLInputElement | null>(null)
const pendingAction = ref<'replace' | 'remove' | null>(null)

async function submitReplace(event: Event) {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  input.value = ''
  if (!file) return

  busy.value = true
  error.value = ''
  message.value = ''
  try {
    const body = new FormData()
    body.append('action', 'replace')
    body.append('file', file, file.name)
    if (notes.value.trim()) body.append('notes', notes.value.trim())
    await $fetch(props.changeRequestUrl, { method: 'POST', body })
    message.value = 'Update request submitted for staff review.'
    notes.value = ''
    emit('submitted')
  }
  catch (e: unknown) {
    error.value = (e as { data?: { message?: string } })?.data?.message ?? 'Could not submit update request'
  }
  finally {
    busy.value = false
    pendingAction.value = null
  }
}

async function submitRemoval() {
  if (!confirm(`Request removal of the ${displayTitle.value.toLowerCase()}?`)) return

  busy.value = true
  error.value = ''
  message.value = ''
  try {
    const body = new FormData()
    body.append('action', 'remove')
    if (notes.value.trim()) body.append('notes', notes.value.trim())
    await $fetch(props.changeRequestUrl, { method: 'POST', body })
    message.value = 'Removal request submitted for staff review.'
    notes.value = ''
    emit('submitted')
  }
  catch (e: unknown) {
    error.value = (e as { data?: { message?: string } })?.data?.message ?? 'Could not submit removal request'
  }
  finally {
    busy.value = false
    pendingAction.value = null
  }
}
</script>

<template>
  <div class="entity-doc-portal card">
    <DocumentsEntityDocumentViewer
      :title="displayTitle"
      :description="displayDescription"
      :category="category"
      :document="document"
      :pending-request="pendingRequest"
    />

    <div class="entity-doc-portal__actions cbody">
      <p class="entity-doc-portal__help">
        Document changes require staff approval. Submit an update with a new file or request removal.
      </p>
      <label class="fld">
        <span>Notes for the shop (optional)</span>
        <textarea v-model="notes" rows="2" maxlength="2000" :disabled="busy || pendingRequest" />
      </label>
      <div class="entity-doc-portal__buttons">
        <button
          type="button"
          class="btn sm"
          :disabled="busy || pendingRequest"
          @click="fileInput?.click()"
        >
          Request update
        </button>
        <button
          v-if="document"
          type="button"
          class="btn sm danger"
          :disabled="busy || pendingRequest"
          @click="submitRemoval"
        >
          Request removal
        </button>
      </div>
      <input
        ref="fileInput"
        type="file"
        class="entity-doc-file-input"
        :accept="acceptTypes"
        @change="submitReplace"
      >
      <p v-if="pendingRequest" class="entity-doc-pending">A change request is already pending review.</p>
      <p v-if="message" class="entity-doc-ok">{{ message }}</p>
      <p v-if="error" class="entity-doc-error">{{ error }}</p>
      <p v-if="busy" class="entity-doc-busy">Submitting request…</p>
    </div>
  </div>
</template>

<style scoped>
.entity-doc-portal__actions {
  border-top: 1px solid #e2e8f0;
}

.entity-doc-portal__help {
  margin: 0 0 12px;
  font-size: 12.5px;
  color: #64748b;
  line-height: 1.45;
}

.entity-doc-portal__buttons {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
  margin-top: 10px;
}

.entity-doc-file-input {
  display: none;
}

.entity-doc-pending,
.entity-doc-ok,
.entity-doc-error,
.entity-doc-busy {
  margin: 8px 0 0;
  font-size: 12.5px;
}

.entity-doc-pending {
  color: #b45309;
  font-weight: 600;
}

.entity-doc-ok {
  color: #059669;
  font-weight: 600;
}

.entity-doc-error {
  color: #b91c1c;
  font-weight: 600;
}

.entity-doc-busy {
  color: #64748b;
}
</style>
