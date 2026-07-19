<script setup lang="ts">
import {
  detectEntityTrigger,
  entityRefToken,
  ENTITY_TYPE_LABELS,
  type EntitySearchItem,
} from '~/utils/messages-ui'
import {
  focusEditorAtEnd,
  getTokenizedTextOffset,
  renderTokenizedEditor,
  resizeComposeField,
  serializeTokenizedRoot,
} from '~/utils/messages-compose-editor'
import type { MessageEntityType } from '~/server/db/schema/messages'

const props = defineProps<{
  disabled?: boolean
  mode?: 'dm' | 'email'
}>()

const emit = defineEmits<{
  send: [body: string, files: File[]]
}>()

const text = ref('')
const textareaEl = ref<HTMLTextAreaElement | null>(null)
const editorEl = ref<HTMLDivElement | null>(null)
const fileInputEl = ref<HTMLInputElement | null>(null)
const attachments = ref<File[]>([])
const attachmentError = ref('')
const previewUrls = ref<string[]>([])
const composeFocused = ref(false)
const isMobile = ref(false)

const EMAIL_ATTACH_ACCEPT = 'image/jpeg,image/png,image/webp,image/gif,image/heic,image/heif,application/pdf'
const DM_ATTACH_ACCEPT = 'image/jpeg,image/png,image/webp,image/gif,image/heic,image/heif'
const MAX_ATTACHMENTS = 10
const MAX_ATTACHMENT_MB = 25
const COMPOSE_MIN_HEIGHT = 44
const COMPOSE_MAX_HEIGHT = 120
const COMPOSE_MAX_HEIGHT_FOCUSED = 168

const isEmail = computed(() => props.mode === 'email')
const attachAccept = computed(() => isEmail.value ? EMAIL_ATTACH_ACCEPT : DM_ATTACH_ACCEPT)
const attachAllowed = computed(() => new Set(attachAccept.value.split(',')))

const placeholder = computed(() => {
  if (isEmail.value) return 'Write your reply…'
  if (isMobile.value) return 'Message…'
  return 'Type invoice, customer, vehicle… to link'
})

const composeMaxHeight = computed(() =>
  composeFocused.value ? COMPOSE_MAX_HEIGHT_FOCUSED : COMPOSE_MAX_HEIGHT,
)

const showComposePlaceholder = computed(() => {
  if (isEmail.value) return false
  return !text.value.replace(/\u200B/g, '').trim()
})

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}

function revokePreviewUrls() {
  for (const url of previewUrls.value) URL.revokeObjectURL(url)
  previewUrls.value = []
}

function rebuildPreviewUrls() {
  revokePreviewUrls()
  previewUrls.value = attachments.value
    .filter(f => f.type.startsWith('image/'))
    .map(f => URL.createObjectURL(f))
}

function resizeActiveComposeField() {
  nextTick(() => {
    const max = composeMaxHeight.value
    if (isEmail.value) {
      const el = textareaEl.value
      if (!el) return
      resizeComposeField(el, max)
    }
    else {
      const el = editorEl.value
      if (!el) return
      resizeComposeField(el, max)
    }
  })
}

function updateMobileFlag() {
  if (!import.meta.client) return
  isMobile.value = window.matchMedia('(max-width: 960px)').matches
}

onMounted(() => {
  updateMobileFlag()
  if (import.meta.client) {
    window.matchMedia('(max-width: 960px)').addEventListener('change', updateMobileFlag)
  }
  resizeActiveComposeField()
})

onBeforeUnmount(() => {
  revokePreviewUrls()
  if (import.meta.client) {
    window.matchMedia('(max-width: 960px)').removeEventListener('change', updateMobileFlag)
  }
})

watch(composeMaxHeight, () => {
  resizeActiveComposeField()
})

function openFilePicker() {
  attachmentError.value = ''
  fileInputEl.value?.click()
}

function onFilesSelected(event: Event) {
  const input = event.target as HTMLInputElement
  const picked = Array.from(input.files ?? [])
  input.value = ''
  if (!picked.length) return

  const errors: string[] = []
  for (const file of picked) {
    if (attachments.value.length >= MAX_ATTACHMENTS) {
      errors.push(`Up to ${MAX_ATTACHMENTS} attachments allowed`)
      break
    }
    if (file.type && !attachAllowed.value.has(file.type)) {
      errors.push(`${file.name}: unsupported type`)
      continue
    }
    if (file.size > MAX_ATTACHMENT_MB * 1024 * 1024) {
      errors.push(`${file.name}: exceeds ${MAX_ATTACHMENT_MB} MB`)
      continue
    }
    if (attachments.value.some(f => f.name === file.name && f.size === file.size)) continue
    attachments.value.push(file)
  }
  attachmentError.value = errors.join(' · ')
  rebuildPreviewUrls()
}

function removeAttachment(index: number) {
  attachments.value.splice(index, 1)
  rebuildPreviewUrls()
}

function isImageFile(file: File): boolean {
  return file.type.startsWith('image/')
}

function previewUrlFor(file: File): string | null {
  if (!isImageFile(file)) return null
  const index = attachments.value.indexOf(file)
  const imageIndex = attachments.value
    .slice(0, index + 1)
    .filter(f => f.type.startsWith('image/')).length - 1
  return previewUrls.value[imageIndex] ?? null
}

const pickerOpen = ref(false)
const pickerType = ref<MessageEntityType | null>(null)
const pickerQuery = ref('')
const pickerStart = ref(0)
const pickerEnd = ref(0)
const pickerItems = ref<EntitySearchItem[]>([])
const pickerLoading = ref(false)
const pickerHighlight = ref(0)

let searchTimer: ReturnType<typeof setTimeout> | null = null

async function loadPickerItems() {
  if (!pickerType.value) return
  pickerLoading.value = true
  try {
    const pageSize = pickerType.value === 'vehicle' ? 500 : 25
    const res = await $fetch<{ items: EntitySearchItem[] }>('/api/messages/entity-search', {
      query: {
        type: pickerType.value,
        q: pickerQuery.value || undefined,
        page: 1,
        pageSize,
      },
    })
    pickerItems.value = res.items
    pickerHighlight.value = 0
  }
  finally {
    pickerLoading.value = false
  }
}

function closePicker() {
  pickerOpen.value = false
  pickerType.value = null
  pickerItems.value = []
  pickerQuery.value = ''
}

function currentCursorPos(): number {
  if (isEmail.value) return textareaEl.value?.selectionStart ?? text.value.length
  if (!editorEl.value) return text.value.length
  return getTokenizedTextOffset(editorEl.value)
}

function onComposeInput() {
  if (isEmail.value) {
    resizeActiveComposeField()
  }
  else if (editorEl.value) {
    text.value = serializeTokenizedRoot(editorEl.value)
    resizeActiveComposeField()
  }

  if (isEmail.value) return
  const trigger = detectEntityTrigger(text.value, currentCursorPos())
  if (trigger) {
    pickerOpen.value = true
    pickerType.value = trigger.entityType
    pickerStart.value = trigger.start
    pickerEnd.value = trigger.end
    pickerQuery.value = ''
    void loadPickerItems()
  }
  else if (pickerOpen.value) {
    closePicker()
  }
}

function onPickerSearchInput() {
  if (searchTimer) clearTimeout(searchTimer)
  searchTimer = setTimeout(() => { void loadPickerItems() }, 200)
}

function insertEntity(item: EntitySearchItem) {
  const token = entityRefToken({
    entityType: item.entityType,
    entityId: item.id,
    entityLabel: item.label,
  })
  const before = text.value.slice(0, pickerStart.value)
  const after = text.value.slice(pickerEnd.value)
  const spacerBefore = before && !/\s$/.test(before) ? ' ' : ''
  const spacerAfter = after && !/^\s/.test(after) ? ' ' : ''
  text.value = `${before}${spacerBefore}${token}${spacerAfter}${after}`
  closePicker()

  nextTick(() => {
    const cursor = before.length + spacerBefore.length + token.length + spacerAfter.length
    if (isEmail.value) {
      const el = textareaEl.value
      if (!el) return
      el.focus()
      el.setSelectionRange(cursor, cursor)
      resizeActiveComposeField()
      return
    }
    const el = editorEl.value
    if (!el) return
    renderTokenizedEditor(el, text.value)
    focusEditorAtEnd(el)
    el.focus()
    resizeActiveComposeField()
  })
}

function onEditorPaste(event: ClipboardEvent) {
  event.preventDefault()
  const plain = event.clipboardData?.getData('text/plain') ?? ''
  if (!plain) return
  const sel = window.getSelection()
  if (!sel?.rangeCount) return
  sel.deleteFromDocument()
  sel.getRangeAt(0).insertNode(document.createTextNode(plain))
  sel.collapseToEnd()
  onComposeInput()
}

function onComposeFocus() {
  composeFocused.value = true
  if (!isEmail.value && editorEl.value) {
    focusEditorAtEnd(editorEl.value)
  }
  resizeActiveComposeField()
}

function onComposeBlur() {
  composeFocused.value = false
  resizeActiveComposeField()
}

const canSend = computed(() =>
  !props.disabled && (!!text.value.trim() || attachments.value.length > 0),
)

function clearCompose() {
  text.value = ''
  if (editorEl.value) editorEl.value.replaceChildren()
  if (textareaEl.value) textareaEl.value.style.height = `${COMPOSE_MIN_HEIGHT}px`
  resizeActiveComposeField()
}

function submit() {
  if (!canSend.value) return
  emit('send', text.value.trim(), attachments.value.slice())
  clearCompose()
  attachments.value = []
  attachmentError.value = ''
  revokePreviewUrls()
  closePicker()
}

function onKeydown(e: KeyboardEvent) {
  if (pickerOpen.value && pickerItems.value.length) {
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      pickerHighlight.value = (pickerHighlight.value + 1) % pickerItems.value.length
      return
    }
    if (e.key === 'ArrowUp') {
      e.preventDefault()
      pickerHighlight.value = (pickerHighlight.value - 1 + pickerItems.value.length) % pickerItems.value.length
      return
    }
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      insertEntity(pickerItems.value[pickerHighlight.value]!)
      return
    }
    if (e.key === 'Escape') {
      e.preventDefault()
      closePicker()
      return
    }
  }
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault()
    submit()
  }
}
</script>

<template>
  <div class="dm-compose" :class="{ 'is-focused': composeFocused, 'is-mobile': isMobile }">
    <div v-if="pickerOpen && pickerType" class="dm-entity-picker">
      <div class="dm-entity-picker-head">
        <b>{{ ENTITY_TYPE_LABELS[pickerType] }}</b>
        <span>Type to search, ↑↓ to navigate, Enter to insert</span>
      </div>
      <input
        v-model="pickerQuery"
        class="dm-entity-picker-search"
        type="search"
        placeholder="Search…"
        @input="onPickerSearchInput"
      >
      <div class="dm-entity-picker-list">
        <button
          v-for="(item, i) in pickerItems"
          :key="item.id"
          type="button"
          class="dm-entity-picker-item"
          :class="{ on: i === pickerHighlight }"
          @mousedown.prevent="insertEntity(item)"
        >
          <b>{{ item.label }}</b>
          <small v-if="item.sublabel">{{ item.sublabel }}</small>
        </button>
        <div v-if="pickerLoading" class="dm-entity-picker-empty">Searching…</div>
        <div v-else-if="!pickerItems.length" class="dm-entity-picker-empty">No matches</div>
      </div>
    </div>

    <div v-if="attachments.length" class="dm-compose-attachments" aria-label="Pending attachments">
      <div
        v-for="(file, i) in attachments"
        :key="`${file.name}-${file.size}-${i}`"
        class="dm-compose-chip"
        :class="{ 'is-image': isImageFile(file) }"
      >
        <img
          v-if="previewUrlFor(file)"
          :src="previewUrlFor(file)!"
          :alt="file.name"
          class="dm-compose-chip-thumb"
        >
        <span v-else class="dm-compose-chip-icon" aria-hidden="true">📎</span>
        <span class="dm-compose-chip-name" :title="file.name">{{ file.name }}</span>
        <small class="dm-compose-chip-size">{{ formatFileSize(file.size) }}</small>
        <button
          type="button"
          class="dm-compose-chip-remove"
          :aria-label="`Remove ${file.name}`"
          @click="removeAttachment(i)"
        >
          ✕
        </button>
      </div>
    </div>
    <p v-if="attachmentError" class="dm-compose-attach-error">{{ attachmentError }}</p>

    <form
      class="dm-compose-form"
      :class="{ 'dm-compose-form--email': isEmail, 'is-focused': composeFocused }"
      @submit.prevent="submit"
    >
      <input
        ref="fileInputEl"
        type="file"
        class="dm-compose-file-input"
        :accept="attachAccept"
        multiple
        capture="environment"
        @change="onFilesSelected"
      >
      <button
        type="button"
        class="dm-attach-btn"
        :disabled="disabled"
        :aria-label="isEmail ? 'Attach files or images' : 'Attach photos'"
        :title="isEmail ? 'Attach files or images' : 'Attach photos'"
        @click="openFilePicker"
      >
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <path
            d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M17 8l-5-5-5 5M12 3v12"
            stroke="currentColor"
            stroke-width="2"
            stroke-linecap="round"
            stroke-linejoin="round"
          />
        </svg>
      </button>
      <textarea
        v-if="isEmail"
        ref="textareaEl"
        v-model="text"
        rows="1"
        :placeholder="placeholder"
        :disabled="disabled"
        aria-label="Message"
        class="dm-compose-input"
        @input="onComposeInput"
        @keydown="onKeydown"
        @focus="onComposeFocus"
        @blur="onComposeBlur"
      />
      <div v-else class="dm-compose-field-wrap">
        <span
          v-if="showComposePlaceholder"
          class="dm-compose-placeholder"
          aria-hidden="true"
        >{{ placeholder }}</span>
        <div
          ref="editorEl"
          class="dm-compose-input dm-compose-editor"
          contenteditable="true"
          role="textbox"
          aria-multiline="true"
          :aria-label="placeholder"
          :contenteditable="!disabled"
          @input="onComposeInput"
          @keydown="onKeydown"
          @focus="onComposeFocus"
          @blur="onComposeBlur"
          @paste="onEditorPaste"
        />
      </div>
      <button
        type="submit"
        class="dm-send-btn"
        :class="{ 'dm-send-btn--labeled': isEmail }"
        :disabled="!canSend"
        :aria-label="isEmail ? 'Send reply' : 'Send'"
      >
        <span v-if="isEmail">Send</span>
        <svg v-else width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <path
            d="M22 2 11 13M22 2l-7 20-4-9-9-4 20-7z"
            stroke="currentColor"
            stroke-width="2"
            stroke-linecap="round"
            stroke-linejoin="round"
          />
        </svg>
      </button>
    </form>
    <div v-if="!isEmail && !isMobile" class="dm-compose-hint">
      Tip: type <code>invoice</code>, <code>customer</code>, <code>vehicle</code>, or <code>service log</code> to attach links
    </div>
  </div>
</template>
