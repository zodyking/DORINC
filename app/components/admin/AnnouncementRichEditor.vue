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
const toolbarState = ref({
  bold: false,
  italic: false,
  underline: false,
  strikeThrough: false,
  insertUnorderedList: false,
  insertOrderedList: false,
  justifyLeft: false,
  justifyCenter: false,
  justifyRight: false,
})

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
  refreshToolbarState()
}

function saveSelection() {
  if (!import.meta.client || !editorRef.value) return
  const sel = window.getSelection()
  if (!sel || sel.rangeCount === 0) return
  const range = sel.getRangeAt(0)
  if (!editorRef.value.contains(range.commonAncestorContainer)) return
  savedRange = range.cloneRange()
  refreshToolbarState()
}

function restoreSelection() {
  if (!import.meta.client || !editorRef.value) return
  editorRef.value.focus()
  const sel = window.getSelection()
  if (!sel) return
  sel.removeAllRanges()
  if (savedRange) sel.addRange(savedRange)
}

function ensureEditableShell() {
  const el = editorRef.value
  if (!el) return
  const text = (el.textContent || '').replace(/\u200B/g, '').trim()
  if (!text && !el.querySelector('img,ul,ol,blockquote,hr,h2,h3')) {
    el.innerHTML = '<p><br></p>'
    // Place caret inside the paragraph
    const p = el.querySelector('p')
    if (p) {
      const range = document.createRange()
      range.setStart(p, 0)
      range.collapse(true)
      const sel = window.getSelection()
      sel?.removeAllRanges()
      sel?.addRange(range)
      savedRange = range.cloneRange()
    }
  }
}

function refreshToolbarState() {
  if (!import.meta.client || props.disabled) return
  const next = { ...toolbarState.value }
  for (const key of Object.keys(next) as Array<keyof typeof next>) {
    try {
      next[key] = document.queryCommandState(key)
    }
    catch {
      next[key] = false
    }
  }
  toolbarState.value = next
}

function exec(command: string, value?: string) {
  if (props.disabled) return
  restoreSelection()
  ensureEditableShell()
  document.execCommand(command, false, value)
  syncFromEditor()
  saveSelection()
}

function formatBlock(tag: 'h2' | 'h3' | 'p' | 'blockquote') {
  if (props.disabled) return
  restoreSelection()
  ensureEditableShell()
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

function removeLink() {
  exec('unlink')
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
  ensureEditableShell()
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
    ensureEditableShell()
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

function onKeydown(e: KeyboardEvent) {
  if (props.disabled) return
  const mod = e.metaKey || e.ctrlKey
  if (!mod) return
  const key = e.key.toLowerCase()
  if (key === 'b') {
    e.preventDefault()
    exec('bold')
  }
  else if (key === 'i') {
    e.preventDefault()
    exec('italic')
  }
  else if (key === 'u') {
    e.preventDefault()
    exec('underline')
  }
  else if (key === 'z' && !e.shiftKey) {
    e.preventDefault()
    exec('undo')
  }
  else if (key === 'y' || (key === 'z' && e.shiftKey)) {
    e.preventDefault()
    exec('redo')
  }
  else if (key === 'k') {
    e.preventDefault()
    askLink()
  }
}
</script>

<template>
  <div class="ann-editor" :class="{ disabled }">
    <div class="ann-editor-toolbar" role="toolbar" aria-label="Formatting">
      <button type="button" class="btn sm" title="Undo" :disabled="disabled" @mousedown.prevent @click="exec('undo')">Undo</button>
      <button type="button" class="btn sm" title="Redo" :disabled="disabled" @mousedown.prevent @click="exec('redo')">Redo</button>
      <span class="ann-editor-sep" aria-hidden="true" />
      <button type="button" class="btn sm" title="Bold (Ctrl+B)" :class="{ on: toolbarState.bold }" :disabled="disabled" @mousedown.prevent @click="exec('bold')"><b>B</b></button>
      <button type="button" class="btn sm" title="Italic (Ctrl+I)" :class="{ on: toolbarState.italic }" :disabled="disabled" @mousedown.prevent @click="exec('italic')"><i>I</i></button>
      <button type="button" class="btn sm" title="Underline (Ctrl+U)" :class="{ on: toolbarState.underline }" :disabled="disabled" @mousedown.prevent @click="exec('underline')"><u>U</u></button>
      <button type="button" class="btn sm" title="Strikethrough" :class="{ on: toolbarState.strikeThrough }" :disabled="disabled" @mousedown.prevent @click="exec('strikeThrough')"><s>S</s></button>
      <span class="ann-editor-sep" aria-hidden="true" />
      <button type="button" class="btn sm" title="Heading 2" :disabled="disabled" @mousedown.prevent @click="formatBlock('h2')">H2</button>
      <button type="button" class="btn sm" title="Heading 3" :disabled="disabled" @mousedown.prevent @click="formatBlock('h3')">H3</button>
      <button type="button" class="btn sm" title="Paragraph" :disabled="disabled" @mousedown.prevent @click="formatBlock('p')">P</button>
      <button type="button" class="btn sm" title="Quote" :disabled="disabled" @mousedown.prevent @click="formatBlock('blockquote')">Quote</button>
      <span class="ann-editor-sep" aria-hidden="true" />
      <button type="button" class="btn sm" title="Bulleted list" :class="{ on: toolbarState.insertUnorderedList }" :disabled="disabled" @mousedown.prevent @click="exec('insertUnorderedList')">• List</button>
      <button type="button" class="btn sm" title="Numbered list" :class="{ on: toolbarState.insertOrderedList }" :disabled="disabled" @mousedown.prevent @click="exec('insertOrderedList')">1. List</button>
      <button type="button" class="btn sm" title="Indent" :disabled="disabled" @mousedown.prevent @click="exec('indent')">Indent</button>
      <button type="button" class="btn sm" title="Outdent" :disabled="disabled" @mousedown.prevent @click="exec('outdent')">Outdent</button>
      <span class="ann-editor-sep" aria-hidden="true" />
      <button type="button" class="btn sm" title="Align left" :class="{ on: toolbarState.justifyLeft }" :disabled="disabled" @mousedown.prevent @click="exec('justifyLeft')">Left</button>
      <button type="button" class="btn sm" title="Align center" :class="{ on: toolbarState.justifyCenter }" :disabled="disabled" @mousedown.prevent @click="exec('justifyCenter')">Center</button>
      <button type="button" class="btn sm" title="Align right" :class="{ on: toolbarState.justifyRight }" :disabled="disabled" @mousedown.prevent @click="exec('justifyRight')">Right</button>
      <span class="ann-editor-sep" aria-hidden="true" />
      <button type="button" class="btn sm" title="Insert link (Ctrl+K)" :disabled="disabled" @mousedown.prevent @click="askLink">Link</button>
      <button type="button" class="btn sm" title="Remove link" :disabled="disabled" @mousedown.prevent @click="removeLink">Unlink</button>
      <button type="button" class="btn sm" title="Horizontal rule" :disabled="disabled" @mousedown.prevent @click="exec('insertHorizontalRule')">Line</button>
      <button type="button" class="btn sm" title="Clear formatting" :disabled="disabled" @mousedown.prevent @click="exec('removeFormat')">Clear</button>
      <label
        class="btn sm ann-editor-upload"
        :class="{ disabled: disabled || uploadBusy }"
        title="Insert image"
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
      <input
        v-model="linkUrl"
        type="url"
        placeholder="https://… or /path"
        @keydown.enter.prevent="applyLink"
      >
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
      @keydown="onKeydown"
      @paste="onPaste"
      @focus="refreshToolbarState"
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
  align-items: center;
  padding: 8px;
  border-bottom: 1px solid #e5e7eb;
  background: #f8fafc;
}
.ann-editor-toolbar .btn.on {
  background: #dbeafe;
  border-color: #93c5fd;
  color: #1d4ed8;
}
.ann-editor-sep {
  width: 1px;
  height: 22px;
  background: #d1d5db;
  margin: 0 2px;
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
  min-height: 220px;
  max-height: 420px;
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
.ann-editor-surface :deep(blockquote) {
  margin: 0.6em 0;
  padding: 0.35em 0.9em;
  border-left: 3px solid #94a3b8;
  color: #334155;
  background: #f8fafc;
}
.ann-editor-surface :deep(hr) {
  border: 0;
  border-top: 1px solid #cbd5e1;
  margin: 1em 0;
}
.ann-editor-surface :deep(h2),
.ann-editor-surface :deep(h3) {
  margin: 0.7em 0 0.35em;
  line-height: 1.25;
}
.ann-editor-surface :deep(ul),
.ann-editor-surface :deep(ol) {
  margin: 0.5em 0;
  padding-left: 1.4em;
}
</style>
