<script setup lang="ts">
import {
  detectEntityTrigger,
  entityRefToken,
  ENTITY_TYPE_LABELS,
  type EntitySearchItem,
} from '~/utils/messages-ui'
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
const fileInputEl = ref<HTMLInputElement | null>(null)
const attachments = ref<File[]>([])
const attachmentError = ref('')

const ATTACH_ACCEPT = 'image/jpeg,image/png,image/webp,image/gif,image/heic,image/heif,application/pdf'
const MAX_ATTACHMENTS = 10
const MAX_ATTACHMENT_MB = 25
const ATTACH_ALLOWED = new Set(ATTACH_ACCEPT.split(','))

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}

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
    if (file.type && !ATTACH_ALLOWED.has(file.type)) {
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
}

function removeAttachment(index: number) {
  attachments.value.splice(index, 1)
}

function isImageFile(file: File): boolean {
  return file.type.startsWith('image/')
}
const pickerOpen = ref(false)
const pickerType = ref<MessageEntityType | null>(null)
const pickerQuery = ref('')
const pickerStart = ref(0)
const pickerEnd = ref(0)
const pickerItems = ref<EntitySearchItem[]>([])
const pickerLoading = ref(false)
const pickerHighlight = ref(0)

const isEmail = computed(() => props.mode === 'email')

let searchTimer: ReturnType<typeof setTimeout> | null = null

async function loadPickerItems() {
  if (!pickerType.value) return
  pickerLoading.value = true
  try {
    const res = await $fetch<{ items: EntitySearchItem[] }>('/api/messages/entity-search', {
      query: {
        type: pickerType.value,
        q: pickerQuery.value || undefined,
        page: 1,
        pageSize: 12,
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

function onInput() {
  if (isEmail.value) return
  const el = textareaEl.value
  if (!el) return
  const trigger = detectEntityTrigger(text.value, el.selectionStart)
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
    const el = textareaEl.value
    if (!el) return
    const pos = (before + spacerBefore + token + spacerAfter).length
    el.focus()
    el.setSelectionRange(pos, pos)
  })
}

function submit() {
  const body = text.value.trim()
  if (!body || props.disabled) return
  emit('send', body, attachments.value.slice())
  text.value = ''
  attachments.value = []
  attachmentError.value = ''
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
  <div class="dm-compose">
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
    <div v-if="isEmail && attachments.length" class="dm-compose-attachments" aria-label="Pending attachments">
      <div
        v-for="(file, i) in attachments"
        :key="`${file.name}-${file.size}-${i}`"
        class="dm-compose-chip"
        :class="{ 'is-image': isImageFile(file) }"
      >
        <span class="dm-compose-chip-icon" aria-hidden="true">{{ isImageFile(file) ? '🖼️' : '📎' }}</span>
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
    <p v-if="isEmail && attachmentError" class="dm-compose-attach-error">{{ attachmentError }}</p>
    <form class="dm-compose-form" :class="{ 'dm-compose-form--email': isEmail }" @submit.prevent="submit">
      <input
        v-if="isEmail"
        ref="fileInputEl"
        type="file"
        class="dm-compose-file-input"
        :accept="ATTACH_ACCEPT"
        multiple
        @change="onFilesSelected"
      >
      <button
        v-if="isEmail"
        type="button"
        class="dm-attach-btn"
        :disabled="disabled"
        aria-label="Attach files or images"
        title="Attach files or images"
        @click="openFilePicker"
      >
        📎
      </button>
      <textarea
        ref="textareaEl"
        v-model="text"
        rows="2"
        :placeholder="isEmail ? 'Write your reply…' : 'Write a message… Type invoice, customer, vehicle, or service log to link records'"
        :disabled="disabled"
        aria-label="Message"
        @input="onInput"
        @keydown="onKeydown"
        @click="onInput"
      />
      <button
        type="submit"
        class="dm-send-btn"
        :class="{ 'dm-send-btn--labeled': isEmail }"
        :disabled="disabled || !text.trim()"
        :aria-label="isEmail ? 'Send reply' : 'Send'"
      >
        <span v-if="isEmail">Send reply</span>
        <span v-else aria-hidden="true">↑</span>
      </button>
    </form>
    <div v-if="!isEmail" class="dm-compose-hint">
      Tip: type <code>invoice</code>, <code>customer</code>, <code>vehicle</code>, or <code>service log</code> to attach links
    </div>
  </div>
</template>
