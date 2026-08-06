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
const blockValue = ref('p')
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

function detectBlockValue(): string {
  if (!import.meta.client || !editorRef.value) return 'p'
  try {
    const raw = String(document.queryCommandValue('formatBlock') || '').toLowerCase()
    if (raw.includes('h2')) return 'h2'
    if (raw.includes('h3')) return 'h3'
    if (raw.includes('blockquote')) return 'blockquote'
    return 'p'
  }
  catch {
    return 'p'
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
  blockValue.value = detectBlockValue()
}

function editorHasFocus() {
  return import.meta.client && !!editorRef.value && (
    document.activeElement === editorRef.value
    || editorRef.value.contains(document.activeElement)
  )
}

function exec(command: string, value?: string) {
  if (props.disabled) return
  // Undo/redo must not run when focus just left another field — that would
  // mutate title/subtitle history via the shared document undo stack.
  if ((command === 'undo' || command === 'redo') && !editorHasFocus() && !savedRange) return
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

function onBlockChange(e: Event) {
  const value = (e.target as HTMLSelectElement).value as 'h2' | 'h3' | 'p' | 'blockquote'
  formatBlock(value)
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

function onEditorFocus() {
  ensureEditableShell()
  refreshToolbarState()
}
</script>

<template>
  <div class="rte" :class="{ disabled }">
    <div class="rte-toolbar" role="toolbar" aria-label="Formatting">
      <div class="rte-group">
        <button type="button" class="rte-btn" title="Undo (Ctrl+Z)" aria-label="Undo" :disabled="disabled" @mousedown.prevent @click="exec('undo')">
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 14 4 9l5-5v3c5.5 0 9.5 2.5 11 7-.8-2.7-3.3-5-7-5H9v3z" /></svg>
        </button>
        <button type="button" class="rte-btn" title="Redo (Ctrl+Y)" aria-label="Redo" :disabled="disabled" @mousedown.prevent @click="exec('redo')">
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m15 14 5-5-5-5v3h-4c-3.7 0-6.2 2.3-7 5 1.5-4.5 5.5-7 11-7h0v3z" /></svg>
        </button>
      </div>

      <span class="rte-sep" aria-hidden="true" />

      <div class="rte-group">
        <label class="rte-select-wrap" title="Text style">
          <span class="sr-only">Text style</span>
          <select
            class="rte-select"
            :value="blockValue"
            :disabled="disabled"
            @mousedown="saveSelection"
            @change="onBlockChange"
          >
            <option value="p">Paragraph</option>
            <option value="h2">Heading 2</option>
            <option value="h3">Heading 3</option>
            <option value="blockquote">Quote</option>
          </select>
        </label>
      </div>

      <span class="rte-sep" aria-hidden="true" />

      <div class="rte-group">
        <button type="button" class="rte-btn" title="Bold (Ctrl+B)" aria-label="Bold" :class="{ on: toolbarState.bold }" :disabled="disabled" @mousedown.prevent @click="exec('bold')">
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 5h6.5a3.5 3.5 0 0 1 0 7H7V5zm0 7h7.5a3.5 3.5 0 0 1 0 7H7v-7z" /></svg>
        </button>
        <button type="button" class="rte-btn" title="Italic (Ctrl+I)" aria-label="Italic" :class="{ on: toolbarState.italic }" :disabled="disabled" @mousedown.prevent @click="exec('italic')">
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M10 5h9v2h-3.2l-3.6 10H16v2H7v-2h3.2l3.6-10H10V5z" /></svg>
        </button>
        <button type="button" class="rte-btn" title="Underline (Ctrl+U)" aria-label="Underline" :class="{ on: toolbarState.underline }" :disabled="disabled" @mousedown.prevent @click="exec('underline')">
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 3v8a5 5 0 0 0 10 0V3h-2v8a3 3 0 0 1-6 0V3H7zm-1 16h12v2H6v-2z" /></svg>
        </button>
        <button type="button" class="rte-btn" title="Strikethrough" aria-label="Strikethrough" :class="{ on: toolbarState.strikeThrough }" :disabled="disabled" @mousedown.prevent @click="exec('strikeThrough')">
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 11h14v2H5v-2zm7.5-7c2.8 0 4.5 1.4 4.5 3.6 0 1.2-.5 2.1-1.5 2.8H9.4c.4-.4.6-.9.6-1.5 0-1.2.9-1.9 2.5-1.9 1.2 0 2.1.4 2.8.9l1-1.5C15.3 5.6 14 5 12.5 5zm-1.2 10h5.3c.3.5.4 1 .4 1.6 0 2.3-1.8 3.9-5 3.9-1.8 0-3.3-.6-4.3-1.5l1.1-1.5c.8.7 1.9 1.1 3.2 1.1 1.6 0 2.6-.7 2.6-1.8 0-.5-.2-1-.5-1.3h-2.8V14z" /></svg>
        </button>
      </div>

      <span class="rte-sep" aria-hidden="true" />

      <div class="rte-group">
        <button type="button" class="rte-btn" title="Bulleted list" aria-label="Bulleted list" :class="{ on: toolbarState.insertUnorderedList }" :disabled="disabled" @mousedown.prevent @click="exec('insertUnorderedList')">
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 6h13v2H8V6zm0 5h13v2H8v-2zm0 5h13v2H8v-2zM3.5 6.5a1.5 1.5 0 1 1 0 3 1.5 1.5 0 0 1 0-3zm0 5a1.5 1.5 0 1 1 0 3 1.5 1.5 0 0 1 0-3zm0 5a1.5 1.5 0 1 1 0 3 1.5 1.5 0 0 1 0-3z" /></svg>
        </button>
        <button type="button" class="rte-btn" title="Numbered list" aria-label="Numbered list" :class="{ on: toolbarState.insertOrderedList }" :disabled="disabled" @mousedown.prevent @click="exec('insertOrderedList')">
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 6h13v2H8V6zm0 5h13v2H8v-2zm0 5h13v2H8v-2zM3 5h2.2v5H3.8V6.4H3V5zm0 7h3v1.1L4.2 15H6v1.2H3v-1.1L4.8 13H3V12z" /></svg>
        </button>
        <button type="button" class="rte-btn" title="Decrease indent" aria-label="Decrease indent" :disabled="disabled" @mousedown.prevent @click="exec('outdent')">
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 5h18v2H3V5zm8 4h10v2H11V9zm0 4h10v2H11v-2zm-8 4h18v2H3v-2zm2.5-3.5L3 11l2.5-2.5V10.5z" /></svg>
        </button>
        <button type="button" class="rte-btn" title="Increase indent" aria-label="Increase indent" :disabled="disabled" @mousedown.prevent @click="exec('indent')">
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 5h18v2H3V5zm8 4h10v2H11V9zm0 4h10v2H11v-2zm-8 4h18v2H3v-2zM3 8.5 5.5 11 3 13.5V8.5z" /></svg>
        </button>
      </div>

      <span class="rte-sep" aria-hidden="true" />

      <div class="rte-group">
        <button type="button" class="rte-btn" title="Align left" aria-label="Align left" :class="{ on: toolbarState.justifyLeft }" :disabled="disabled" @mousedown.prevent @click="exec('justifyLeft')">
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 5h18v2H3V5zm0 4h12v2H3V9zm0 4h18v2H3v-2zm0 4h12v2H3v-2z" /></svg>
        </button>
        <button type="button" class="rte-btn" title="Align center" aria-label="Align center" :class="{ on: toolbarState.justifyCenter }" :disabled="disabled" @mousedown.prevent @click="exec('justifyCenter')">
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 5h18v2H3V5zm3 4h12v2H6V9zm-3 4h18v2H3v-2zm3 4h12v2H6v-2z" /></svg>
        </button>
        <button type="button" class="rte-btn" title="Align right" aria-label="Align right" :class="{ on: toolbarState.justifyRight }" :disabled="disabled" @mousedown.prevent @click="exec('justifyRight')">
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 5h18v2H3V5zm6 4h12v2H9V9zm-6 4h18v2H3v-2zm6 4h12v2H9v-2z" /></svg>
        </button>
      </div>

      <span class="rte-sep" aria-hidden="true" />

      <div class="rte-group">
        <button type="button" class="rte-btn" title="Insert link (Ctrl+K)" aria-label="Insert link" :disabled="disabled" @mousedown.prevent @click="askLink">
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M10.6 13.4a3.5 3.5 0 0 1 0-5l2.1-2.1a3.5 3.5 0 1 1 5 5l-1 1-1.4-1.4 1-1a1.5 1.5 0 0 0-2.1-2.1l-2.1 2.1a1.5 1.5 0 0 0 0 2.1l.4.4-1.4 1.4-.4-.4zm2.8-2.8a3.5 3.5 0 0 1 0 5l-2.1 2.1a3.5 3.5 0 1 1-5-5l1-1 1.4 1.4-1 1a1.5 1.5 0 0 0 2.1 2.1l2.1-2.1a1.5 1.5 0 0 0 0-2.1l-.4-.4 1.4-1.4.4.4z" /></svg>
        </button>
        <button type="button" class="rte-btn" title="Remove link" aria-label="Remove link" :disabled="disabled" @mousedown.prevent @click="removeLink">
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m16.2 5.8 1.4 1.4-2.1 2.1 1.4 1.4 2.1-2.1 1.4 1.4-2.1 2.1 2 2-1.4 1.4-2-2-2.1 2.1-1.4-1.4 2.1-2.1-1.4-1.4-2.1 2.1-1.4-1.4 2.1-2.1-2-2 1.4-1.4 2 2 2.1-2.1zM8.5 11.1l2.1-2.1a3.5 3.5 0 0 1 5 0l.7.7-1.4 1.4-.7-.7a1.5 1.5 0 0 0-2.1 0L9.9 12.5l-1.4-1.4zm-.7 4.3-.7-.7a3.5 3.5 0 0 1 0-5l.4-.4 1.4 1.4-.4.4a1.5 1.5 0 0 0 0 2.1l.7.7-1.4 1.4z" /></svg>
        </button>
        <button type="button" class="rte-btn" title="Horizontal rule" aria-label="Horizontal rule" :disabled="disabled" @mousedown.prevent @click="exec('insertHorizontalRule')">
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 11h16v2H4v-2z" /></svg>
        </button>
        <button type="button" class="rte-btn" title="Clear formatting" aria-label="Clear formatting" :disabled="disabled" @mousedown.prevent @click="exec('removeFormat')">
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m12.7 5 1.4 1.4-1.8 1.8 5.5 5.5-1.4 1.4-1.8-1.8-1.8 1.8L11.4 15l1.8-1.8-5.5-5.5L9.1 6.3 10.9 8.1 12.7 5zM5 18h14v2H5v-2z" /></svg>
        </button>
        <label
          class="rte-btn rte-upload"
          :class="{ disabled: disabled || uploadBusy, on: uploadBusy }"
          :title="uploadBusy ? 'Uploading image…' : 'Insert image'"
          @mousedown.prevent="saveSelection"
        >
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 5h14a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2zm0 2v6.6l3.2-3.2a1 1 0 0 1 1.4 0L14 15l2.3-2.3a1 1 0 0 1 1.4 0L21 15.6V7H5zm3.5 1.5a1.5 1.5 0 1 1 0 3 1.5 1.5 0 0 1 0-3z" /></svg>
          <span class="sr-only">{{ uploadBusy ? 'Uploading image' : 'Insert image' }}</span>
          <input
            type="file"
            accept="image/*"
            :disabled="disabled || uploadBusy"
            @change="onPickImage"
          >
        </label>
      </div>
    </div>

    <div
      v-if="showLinkPrompt"
      class="rte-linkrow"
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

    <p v-if="uploadError" class="help rte-error">{{ uploadError }}</p>

    <div
      ref="editorRef"
      class="rte-surface"
      role="textbox"
      aria-multiline="true"
      aria-label="Message body"
      data-placeholder="Write the message body…"
      :contenteditable="disabled ? 'false' : 'true'"
      @input="syncFromEditor"
      @blur="syncFromEditor"
      @mouseup="saveSelection"
      @keyup="saveSelection"
      @keydown="onKeydown"
      @paste="onPaste"
      @focus="onEditorFocus"
    />
  </div>
</template>

<style scoped>
.rte {
  border: 1px solid #d0d7de;
  border-radius: 10px;
  overflow: hidden;
  background: #fff;
  box-shadow: 0 1px 2px rgba(15, 23, 42, 0.04);
}

.rte.disabled {
  opacity: 0.7;
}

.rte-toolbar {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 4px;
  padding: 6px 8px;
  border-bottom: 1px solid #e5e7eb;
  background: linear-gradient(180deg, #f8fafc 0%, #f1f5f9 100%);
}

.rte-group {
  display: inline-flex;
  align-items: center;
  gap: 2px;
}

.rte-sep {
  width: 1px;
  height: 22px;
  background: #d1d5db;
  margin: 0 4px;
}

.rte-btn {
  appearance: none;
  box-sizing: border-box;
  width: 32px;
  height: 32px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border: 1px solid transparent;
  border-radius: 6px;
  background: transparent;
  color: #334155;
  cursor: pointer;
  padding: 0;
}

.rte-btn svg {
  width: 16px;
  height: 16px;
  fill: currentColor;
}

.rte-btn:hover:not(:disabled) {
  background: #fff;
  border-color: #cbd5e1;
  color: #0f172a;
}

.rte-btn:focus-visible {
  outline: 2px solid #2563eb;
  outline-offset: 1px;
}

.rte-btn.on {
  background: #e2e8f0;
  border-color: #cbd5e1;
  color: #0f172a;
}

.rte-btn:disabled {
  opacity: 0.45;
  cursor: not-allowed;
}

.rte-select-wrap {
  display: inline-flex;
  margin: 0;
  font-weight: 500;
}

.rte-select {
  height: 32px;
  min-width: 118px;
  border: 1px solid #cbd5e1;
  border-radius: 6px;
  background: #fff;
  color: #0f172a;
  font: inherit;
  font-size: 12.5px;
  font-weight: 600;
  padding: 0 28px 0 10px;
  cursor: pointer;
  appearance: none;
  background-image:
    linear-gradient(45deg, transparent 50%, #64748b 50%),
    linear-gradient(135deg, #64748b 50%, transparent 50%);
  background-position:
    calc(100% - 14px) 13px,
    calc(100% - 9px) 13px;
  background-size: 5px 5px, 5px 5px;
  background-repeat: no-repeat;
}

.rte-select:focus-visible {
  outline: 2px solid #2563eb;
  outline-offset: 1px;
}

.rte-upload {
  position: relative;
  overflow: hidden;
}

.rte-upload.disabled {
  pointer-events: none;
  opacity: 0.45;
}

.rte-upload input {
  position: absolute;
  inset: 0;
  opacity: 0;
  cursor: pointer;
}

.rte-linkrow {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  padding: 8px 10px;
  border-bottom: 1px solid #e5e7eb;
  background: #f8fafc;
}

.rte-linkrow input {
  flex: 1;
  min-width: 180px;
  height: 34px;
  border: 1px solid #cbd5e1;
  border-radius: 6px;
  padding: 0 10px;
  font: inherit;
}

.rte-error {
  color: #dc2626;
  margin: 8px 10px 0;
}

.rte-surface {
  min-height: 240px;
  max-height: 440px;
  overflow: auto;
  padding: 14px 16px;
  outline: none;
  line-height: 1.6;
  font-size: 15px;
  color: #0f172a;
}

.rte-surface:focus {
  box-shadow: inset 0 0 0 2px rgba(37, 99, 235, 0.18);
}

.rte-surface:empty::before {
  content: attr(data-placeholder);
  color: #94a3b8;
  pointer-events: none;
}

.rte-surface :deep(img) {
  max-width: 100%;
  height: auto;
  border-radius: 6px;
}

.rte-surface :deep(blockquote) {
  margin: 0.65em 0;
  padding: 0.4em 0.95em;
  border-left: 3px solid #94a3b8;
  color: #334155;
  background: #f8fafc;
}

.rte-surface :deep(hr) {
  border: 0;
  border-top: 1px solid #cbd5e1;
  margin: 1em 0;
}

.rte-surface :deep(h2),
.rte-surface :deep(h3) {
  margin: 0.75em 0 0.35em;
  line-height: 1.25;
}

.rte-surface :deep(p) {
  margin: 0.45em 0;
}

.rte-surface :deep(ul),
.rte-surface :deep(ol) {
  margin: 0.5em 0;
  padding-left: 1.4em;
}

.rte-surface :deep(a) {
  color: #2563eb;
  text-decoration: underline;
}

.sr-only {
  position: absolute;
  width: 1px;
  height: 1px;
  padding: 0;
  margin: -1px;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
  white-space: nowrap;
  border: 0;
}

@media (max-width: 640px) {
  .rte-sep {
    display: none;
  }

  .rte-toolbar {
    gap: 2px;
  }
}
</style>
