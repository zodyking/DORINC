<script setup lang="ts">
const model = defineModel<string>({ default: '' })

const props = defineProps<{
  announcementId?: string | null
  disabled?: boolean
}>()

const editorRef = ref<HTMLDivElement | null>(null)
const linkUrl = ref('')
const showLinkPrompt = ref(false)
const uploadBusy = ref(false)
const uploadError = ref('')

watch(model, (html) => {
  const el = editorRef.value
  if (!el || document.activeElement === el) return
  if (el.innerHTML !== html) el.innerHTML = html || ''
}, { flush: 'post' })

onMounted(() => {
  if (editorRef.value) editorRef.value.innerHTML = model.value || ''
})

function syncFromEditor() {
  if (!editorRef.value) return
  model.value = editorRef.value.innerHTML
}

function exec(command: string, value?: string) {
  if (props.disabled) return
  editorRef.value?.focus()
  document.execCommand(command, false, value)
  syncFromEditor()
}

function askLink() {
  showLinkPrompt.value = true
  linkUrl.value = 'https://'
}

function applyLink() {
  const href = linkUrl.value.trim()
  if (!href) {
    showLinkPrompt.value = false
    return
  }
  exec('createLink', href)
  showLinkPrompt.value = false
}

async function uploadInlineImage(file: File) {
  if (!props.announcementId) {
    uploadError.value = 'Save the message first, then add images.'
    return
  }
  uploadBusy.value = true
  uploadError.value = ''
  try {
    const body = new FormData()
    body.append('file', file)
    body.append('ownerEntityType', 'announcement')
    body.append('ownerEntityId', props.announcementId)
    body.append('fileKind', 'attachment')
    const res = await $fetch<{ file: { id: string } }>('/api/files', {
      method: 'POST',
      body,
    })
    exec('insertImage', `/api/files/${res.file.id}/preview`)
  }
  catch {
    uploadError.value = 'Image upload failed'
  }
  finally {
    uploadBusy.value = false
  }
}

function onPickImage(e: Event) {
  const input = e.target as HTMLInputElement
  const file = input.files?.[0]
  input.value = ''
  if (file) void uploadInlineImage(file)
}
</script>

<template>
  <div class="ann-editor" :class="{ disabled }">
    <div class="ann-editor-toolbar" role="toolbar" aria-label="Formatting">
      <button type="button" class="btn sm" :disabled="disabled" @click="exec('bold')"><b>B</b></button>
      <button type="button" class="btn sm" :disabled="disabled" @click="exec('italic')"><i>I</i></button>
      <button type="button" class="btn sm" :disabled="disabled" @click="exec('underline')"><u>U</u></button>
      <button type="button" class="btn sm" :disabled="disabled" @click="exec('formatBlock', 'h2')">H2</button>
      <button type="button" class="btn sm" :disabled="disabled" @click="exec('formatBlock', 'h3')">H3</button>
      <button type="button" class="btn sm" :disabled="disabled" @click="exec('insertUnorderedList')">• List</button>
      <button type="button" class="btn sm" :disabled="disabled" @click="exec('insertOrderedList')">1. List</button>
      <button type="button" class="btn sm" :disabled="disabled" @click="askLink">Link</button>
      <label class="btn sm ann-editor-upload" :class="{ disabled: disabled || uploadBusy || !announcementId }">
        {{ uploadBusy ? 'Uploading…' : 'Image' }}
        <input
          type="file"
          accept="image/*"
          :disabled="disabled || uploadBusy || !announcementId"
          @change="onPickImage"
        >
      </label>
    </div>

    <div
      v-if="showLinkPrompt"
      class="ann-editor-linkrow"
    >
      <input v-model="linkUrl" type="url" placeholder="https://… or /path" >
      <button type="button" class="btn sm primary" @click="applyLink">Apply</button>
      <button type="button" class="btn sm" @click="showLinkPrompt = false">Cancel</button>
    </div>

    <p v-if="uploadError" class="help" style="color:#dc2626; margin:8px 0 0;">{{ uploadError }}</p>
    <p v-if="!announcementId" class="help" style="margin:8px 0 0;">
      Save once to enable image uploads in the body.
    </p>

    <div
      ref="editorRef"
      class="ann-editor-surface"
      role="textbox"
      aria-multiline="true"
      aria-label="Message body"
      :contenteditable="disabled ? 'false' : 'true'"
      @input="syncFromEditor"
      @blur="syncFromEditor"
    />
  </div>
</template>

<style scoped>
.ann-editor {
  border: 1px solid #d1d5db;
  border-radius: 10px;
  overflow: hidden;
  background: #fff;
}
.ann-editor.disabled {
  opacity: 0.7;
}
.ann-editor-toolbar {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  padding: 8px;
  border-bottom: 1px solid #e5e7eb;
  background: #f8fafc;
}
.ann-editor-upload {
  position: relative;
  overflow: hidden;
  cursor: pointer;
}
.ann-editor-upload.disabled {
  pointer-events: none;
  opacity: 0.55;
}
.ann-editor-upload input {
  position: absolute;
  inset: 0;
  opacity: 0;
  cursor: pointer;
}
.ann-editor-linkrow {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  padding: 8px;
  border-bottom: 1px solid #e5e7eb;
}
.ann-editor-linkrow input {
  flex: 1;
  min-width: 180px;
}
.ann-editor-surface {
  min-height: 160px;
  max-height: 280px;
  overflow: auto;
  padding: 12px 14px;
  outline: none;
  line-height: 1.55;
}
.ann-editor-surface:focus {
  box-shadow: inset 0 0 0 2px rgba(37, 99, 235, 0.25);
}
.ann-editor-surface :deep(img) {
  max-width: 100%;
  height: auto;
}
</style>
