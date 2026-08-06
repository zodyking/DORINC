<script setup lang="ts">
import {
  materializeAnnouncementDataImages,
  uploadAnnouncementImage,
} from '~/utils/announcement-inline-images'

const model = defineModel<string>({ default: '' })

const props = defineProps<{
  announcementId?: string | null
  /** Create/return a persisted announcement id so uploads can run before the first manual save. */
  ensureAnnouncementId?: () => Promise<string>
  disabled?: boolean
}>()

const emit = defineEmits<{
  'update:announcementId': [id: string]
  error: [message: string]
}>()

const editorRef = ref<HTMLDivElement | null>(null)
const linkUrl = ref('')
const showLinkPrompt = ref(false)
const uploadBusy = ref(false)
const uploadError = ref('')
let savedRange: Range | null = null
let ensureLock: Promise<string> | null = null

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

function saveSelection() {
  if (!import.meta.client || !editorRef.value) return
  const sel = window.getSelection()
  if (!sel || sel.rangeCount === 0) return
  const range = sel.getRangeAt(0)
  if (!editorRef.value.contains(range.commonAncestorContainer)) return
  savedRange = range.cloneRange()
}

function restoreSelection() {
  if (!import.meta.client || !editorRef.value) return
  editorRef.value.focus()
  const sel = window.getSelection()
  if (!sel) return
  sel.removeAllRanges()
  if (savedRange) sel.addRange(savedRange)
}

function exec(command: string, value?: string) {
  if (props.disabled) return
  restoreSelection()
  document.execCommand(command, false, value)
  syncFromEditor()
  saveSelection()
}

function formatBlock(tag: 'h2' | 'h3' | 'p') {
  if (props.disabled) return
  restoreSelection()
  // Chrome wants <h2>; Firefox accepts h2. Try both.
  const ok = document.execCommand('formatBlock', false, `<${tag}>`)
  if (!ok) document.execCommand('formatBlock', false, tag)
  syncFromEditor()
  saveSelection()
}

function askLink() {
  saveSelection()
  showLinkPrompt.value = true
  linkUrl.value = 'https://'
}

function applyLink() {
  const href = linkUrl.value.trim()
  showLinkPrompt.value = false
  if (!href) return
  exec('createLink', href)
}

async function resolveAnnouncementId(): Promise<string | null> {
  if (props.announcementId) return props.announcementId
  if (!props.ensureAnnouncementId) return null
  if (!ensureLock) {
    ensureLock = props.ensureAnnouncementId()
      .then((id) => {
        emit('update:announcementId', id)
        return id
      })
      .finally(() => {
        ensureLock = null
      })
  }
  return ensureLock
}

function insertImageUrl(url: string) {
  restoreSelection()
  const ok = document.execCommand('insertImage', false, url)
  if (!ok && editorRef.value) {
    document.execCommand('insertHTML', false, `<img src="${url}" alt="">`)
  }
  syncFromEditor()
  saveSelection()
}

async function uploadInlineImage(file: File) {
  uploadBusy.value = true
  uploadError.value = ''
  try {
    const id = await resolveAnnouncementId()
    if (!id) {
      uploadError.value = 'Could not prepare this message for image upload.'
      emit('error', uploadError.value)
      return
    }
    const uploaded = await uploadAnnouncementImage(id, file)
    insertImageUrl(uploaded.url)
  }
  catch {
    uploadError.value = 'Image upload failed'
    emit('error', uploadError.value)
  }
  finally {
    uploadBusy.value = false
  }
}

function onPickImage(e: Event) {
  const input = e.target as HTMLInputElement
  const file = input.files?.[0]
  input.value = ''
  saveSelection()
  if (file) void uploadInlineImage(file)
}

async function pasteHtmlWithImages(html: string) {
  uploadBusy.value = true
  uploadError.value = ''
  try {
    const id = await resolveAnnouncementId()
    if (!id) {
      uploadError.value = 'Could not prepare this message for image upload.'
      emit('error', uploadError.value)
      return
    }
    const rewritten = await materializeAnnouncementDataImages(html, id)
    restoreSelection()
    document.execCommand('insertHTML', false, rewritten)
    syncFromEditor()
    saveSelection()
  }
  catch {
    uploadError.value = 'Could not upload pasted images'
    emit('error', uploadError.value)
  }
  finally {
    uploadBusy.value = false
  }
}

function onPaste(e: ClipboardEvent) {
  if (props.disabled) return
  saveSelection()

  const items = Array.from(e.clipboardData?.items ?? [])
  const imageItem = items.find(item => item.type.startsWith('image/'))
  if (imageItem) {
    e.preventDefault()
    const file = imageItem.getAsFile()
    if (file) void uploadInlineImage(file)
    return
  }

  const html = e.clipboardData?.getData('text/html') || ''
  if (html && /src\s*=\s*["']\s*data:image\//i.test(html)) {
    e.preventDefault()
    void pasteHtmlWithImages(html)
  }
}
</script>

<template>
  <div class="ann-editor" :class="{ disabled }">
    <div class="ann-editor-toolbar" role="toolbar" aria-label="Formatting">
      <button type="button" class="btn sm" :disabled="disabled" @mousedown.prevent @click="exec('bold')"><b>B</b></button>
      <button type="button" class="btn sm" :disabled="disabled" @mousedown.prevent @click="exec('italic')"><i>I</i></button>
      <button type="button" class="btn sm" :disabled="disabled" @mousedown.prevent @click="exec('underline')"><u>U</u></button>
      <button type="button" class="btn sm" :disabled="disabled" @mousedown.prevent @click="formatBlock('h2')">H2</button>
      <button type="button" class="btn sm" :disabled="disabled" @mousedown.prevent @click="formatBlock('h3')">H3</button>
      <button type="button" class="btn sm" :disabled="disabled" @mousedown.prevent @click="formatBlock('p')">P</button>
      <button type="button" class="btn sm" :disabled="disabled" @mousedown.prevent @click="exec('insertUnorderedList')">• List</button>
      <button type="button" class="btn sm" :disabled="disabled" @mousedown.prevent @click="exec('insertOrderedList')">1. List</button>
      <button type="button" class="btn sm" :disabled="disabled" @mousedown.prevent @click="askLink">Link</button>
      <label
        class="btn sm ann-editor-upload"
        :class="{ disabled: disabled || uploadBusy }"
        @mousedown.prevent="saveSelection"
      >
        {{ uploadBusy ? 'Uploading…' : 'Image' }}
        <input
          type="file"
          accept="image/*"
          :disabled="disabled || uploadBusy"
          @change="onPickImage"
        >
      </label>
    </div>

    <div
      v-if="showLinkPrompt"
      class="ann-editor-linkrow"
    >
      <input v-model="linkUrl" type="url" placeholder="https://… or /path" >
      <button type="button" class="btn sm primary" @mousedown.prevent @click="applyLink">Apply</button>
      <button type="button" class="btn sm" @mousedown.prevent @click="showLinkPrompt = false">Cancel</button>
    </div>

    <p v-if="uploadError" class="help" style="color:#dc2626; margin:8px 0 0;">{{ uploadError }}</p>

    <div
      ref="editorRef"
      class="ann-editor-surface"
      role="textbox"
      aria-multiline="true"
      aria-label="Message body"
      :contenteditable="disabled ? 'false' : 'true'"
      @input="syncFromEditor"
      @blur="syncFromEditor"
      @mouseup="saveSelection"
      @keyup="saveSelection"
      @paste="onPaste"
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
