<script setup lang="ts">
// Platform help chat — staff app (ChatGPT-style UI with vision support).
import {
  helpContextLabel,
  helpPageKeyFromRoute,
  isPlatformHelpWidgetVisible,
  platformHelpPoweredByLabel,
} from '~/utils/platform-help-ui'
import { syncFetchErrorMessage } from '~/utils/fetch-blob-error'

interface PendingAttachment {
  id: string
  dataUrl: string
  name: string
  size: number
}

interface ChatMessage {
  id: string
  role: 'user' | 'assistant' | 'typing'
  html: string
  text: string
  imageDataUrls?: string[]
}

const MAX_ATTACHMENTS = 4
const MAX_ATTACHMENT_BYTES = 4 * 1024 * 1024

const route = useRoute()
const auth = useAuthStore()

const panelOpen = ref(false)
const fullscreen = ref(false)
const busy = ref(false)
const input = ref('')
const pendingAttachments = ref<PendingAttachment[]>([])
const attachError = ref('')
const messages = ref<ChatMessage[]>([])

const canUseHelp = computed(() => auth.can('ai.help.all'))
const pageKey = computed(() => helpPageKeyFromRoute(route.path, route.query))
const contextLabel = computed(() => helpContextLabel(pageKey.value))

const displayName = computed(() => auth.user?.name ?? 'there')
const storageKey = computed(() => `dorinc-help-chat-${auth.user?.id ?? 'anon'}`)

const { data: helpStatus, refresh: refreshHelpStatus } = useClientFetch<{
  enabled: boolean
  aiAvailable: boolean
  capped: boolean
  imageUploadEnabled: boolean
  model: string | null
}>(
  '/api/ai/help-status',
  { immediate: false },
)

const poweredByLabel = computed(() => platformHelpPoweredByLabel(helpStatus.value?.model))

watch([() => auth.loaded, canUseHelp], ([loaded, can]) => {
  if (loaded && can) refreshHelpStatus()
}, { immediate: true })

const widgetVisible = computed(() =>
  isPlatformHelpWidgetVisible(canUseHelp.value, helpStatus.value),
)

const imageUploadEnabled = computed(() => Boolean(helpStatus.value?.imageUploadEnabled))
const canAddAttachments = computed(() => pendingAttachments.value.length < MAX_ATTACHMENTS)

watch(widgetVisible, (visible) => {
  if (!visible) closePanel()
})

function createId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`
}

function stripHtml(html: string): string {
  return html
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

function welcomeMessage(): ChatMessage {
  const first = displayName.value.split(' ')[0]
  const html = `<p>Hi ${first}! I'm <b>Susan</b>. Ask how to use DORINC, or attach a screenshot and I'll walk you through what I see.</p>`
  return {
    id: 'welcome',
    role: 'assistant',
    html,
    text: stripHtml(html),
  }
}

function loadStoredMessages() {
  if (!import.meta.client) return
  try {
    const raw = sessionStorage.getItem(storageKey.value)
    if (!raw) {
      messages.value = [welcomeMessage()]
      return
    }
    const parsed = JSON.parse(raw) as ChatMessage[]
    messages.value = parsed.length ? parsed : [welcomeMessage()]
  }
  catch {
    messages.value = [welcomeMessage()]
  }
}

const MAX_HISTORY_CONTENT = 3500

function persistMessages() {
  if (!import.meta.client) return
  const toStore = messages.value
    .filter(m => m.role !== 'typing')
    .map((m) => {
      if (!m.imageDataUrls?.length) return m
      return {
        ...m,
        imageDataUrls: undefined,
        html: buildUserMessageHtml(m.text, []),
      }
    })
  try {
    sessionStorage.setItem(storageKey.value, JSON.stringify(toStore))
  }
  catch {
    try {
      const slim = toStore.map(m => ({
        id: m.id,
        role: m.role,
        html: m.html.replace(/data:image\/[^"']+/gi, ''),
        text: m.text.slice(0, MAX_HISTORY_CONTENT),
      }))
      sessionStorage.setItem(storageKey.value, JSON.stringify(slim))
    }
    catch {
      sessionStorage.removeItem(storageKey.value)
    }
  }
}

function openPanel() {
  panelOpen.value = true
  if (!messages.value.length) loadStoredMessages()
  nextTick(() => {
    const el = document.getElementById('help-input') as HTMLTextAreaElement | null
    el?.focus()
    resizeInput()
  })
}

function closePanel() {
  panelOpen.value = false
  fullscreen.value = false
  pendingAttachments.value = []
  attachError.value = ''
}

function togglePanel() {
  if (panelOpen.value) closePanel()
  else openPanel()
}

function toggleFullscreen() {
  fullscreen.value = !fullscreen.value
}

function clearChatHistory() {
  if (busy.value) return
  messages.value = [welcomeMessage()]
  pendingAttachments.value = []
  attachError.value = ''
  input.value = ''
  sessionStorage.removeItem(storageKey.value)
}

const imageInputRef = ref<HTMLInputElement | null>(null)

function openImagePicker() {
  if (!canAddAttachments.value || busy.value) return
  imageInputRef.value?.click()
}

async function onImageSelected(event: Event) {
  const inputEl = event.target as HTMLInputElement
  const files = [...(inputEl.files ?? [])]
  inputEl.value = ''
  if (!files.length) return

  attachError.value = ''
  const errors: string[] = []

  for (const file of files) {
    if (pendingAttachments.value.length >= MAX_ATTACHMENTS) {
      errors.push(`Up to ${MAX_ATTACHMENTS} attachments allowed`)
      break
    }
    if (!file.type.startsWith('image/')) {
      errors.push(`${file.name} is not an image`)
      continue
    }
    if (file.size > MAX_ATTACHMENT_BYTES) {
      errors.push(`${file.name} must be under 4 MB`)
      continue
    }
    if (pendingAttachments.value.some(item => item.name === file.name && item.size === file.size)) {
      continue
    }

    const dataUrl = await readFileAsDataUrl(file)
    pendingAttachments.value.push({
      id: createId(),
      dataUrl,
      name: file.name,
      size: file.size,
    })
  }

  if (errors.length) attachError.value = errors.join(' · ')
}

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result ?? ''))
    reader.onerror = () => reject(reader.error)
    reader.readAsDataURL(file)
  })
}

function removeAttachment(id: string) {
  pendingAttachments.value = pendingAttachments.value.filter(item => item.id !== id)
  attachError.value = ''
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

function buildUserMessageHtml(text: string, imageDataUrls: string[]): string {
  const parts = [escapeHtml(text)]
  if (imageDataUrls.length) {
    const thumbs = imageDataUrls.map((url, index) =>
      `<img src="${url}" alt="Attached image ${index + 1}" class="help-attached-img">`,
    ).join('')
    parts.push(`<div class="help-attached-wrap">${thumbs}</div>`)
  }
  return parts.join('')
}

function pushAssistant(html: string) {
  messages.value.push({
    id: createId(),
    role: 'assistant',
    html,
    text: stripHtml(html),
  })
  persistMessages()
}

function buildApiHistory() {
  return messages.value
    .filter(m => (m.role === 'user' || m.role === 'assistant') && m.id !== 'welcome')
    .slice(-40)
    .map(m => ({
      role: m.role as 'user' | 'assistant',
      content: m.text.trim().slice(0, MAX_HISTORY_CONTENT),
    }))
    .filter(m => m.content.length > 0)
}

async function sendMessage() {
  const text = input.value.trim()
  const attachments = pendingAttachments.value.slice()
  if ((!text && !attachments.length) || busy.value) return

  const imageDataUrls = attachments.map(item => item.dataUrl)
  const question = text || (attachments.length > 1
    ? 'What is in these images? Describe them and explain how they relate to using DORINC.'
    : 'What is in this image? Describe it in detail and explain what it is used for.')

  messages.value.push({
    id: createId(),
    role: 'user',
    html: buildUserMessageHtml(question, imageDataUrls),
    text: question,
    imageDataUrls,
  })
  input.value = ''
  pendingAttachments.value = []
  attachError.value = ''
  resizeInput()
  messages.value.push({ id: 'typing', role: 'typing', html: '', text: '' })
  busy.value = true
  scrollMessages()

  try {
    const history = buildApiHistory()
    const res = await $fetch<{ answer: string, source: 'ai' | 'fallback', capped: boolean }>('/api/ai/help', {
      method: 'POST',
      body: {
        question,
        pageContext: contextLabel.value.replace('Viewing · ', '') || undefined,
        imageDataUrls: imageDataUrls.length ? imageDataUrls : undefined,
        history: history.length > 1 ? history.slice(0, -1) : undefined,
      },
    })
    messages.value = messages.value.filter(m => m.role !== 'typing')
    let answer = res.answer
    if (res.source === 'fallback' && !imageDataUrls.length) {
      if (res.capped) {
        answer += '<p><small>AI spend cap reached — showing built-in help where possible.</small></p>'
      }
      else if (!answer.includes('Control Panel → AI') && !answer.includes('OpenRouter')) {
        answer += '<p><small>Using built-in help — live Susan AI was unavailable for this reply.</small></p>'
      }
    }
    pushAssistant(answer)
  }
  catch (err) {
    messages.value = messages.value.filter(m => m.role !== 'typing')
    const detail = syncFetchErrorMessage(err, 'Could not reach the help service')
    pushAssistant(`<p>Sorry, ${detail}. Check your connection and try again.</p>`)
  }
  finally {
    busy.value = false
    scrollMessages()
  }
}

function onSubmit(e: Event) {
  e.preventDefault()
  sendMessage()
}

function onKeydown(e: KeyboardEvent) {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault()
    sendMessage()
  }
}

const msgsEl = ref<HTMLElement | null>(null)
const inputEl = ref<HTMLTextAreaElement | null>(null)

function scrollMessages() {
  nextTick(() => {
    if (msgsEl.value) msgsEl.value.scrollTop = msgsEl.value.scrollHeight
  })
}

function resizeInput() {
  nextTick(() => {
    const el = inputEl.value
    if (!el) return
    el.style.height = 'auto'
    el.style.height = `${Math.min(el.scrollHeight, 160)}px`
  })
}

watch(input, resizeInput)

watch(panelOpen, (open) => {
  document.body.classList.toggle('help-on', open && widgetVisible.value)
  document.body.classList.toggle('help-chat-open', open)
  document.body.classList.toggle('help-fullscreen', open && fullscreen.value)
})

watch(fullscreen, (on) => {
  document.body.classList.toggle('help-fullscreen', on && panelOpen.value)
})

const { registerWidget, unregisterWidget } = usePlatformHelpShell()

onMounted(() => {
  loadStoredMessages()
  registerWidget({
    visible: widgetVisible,
    panelOpen,
    togglePanel,
  })
})

onUnmounted(() => {
  unregisterWidget()
  document.body.classList.remove('help-on', 'help-chat-open', 'help-fullscreen')
})
</script>

<template>
  <template v-if="widgetVisible">
    <div
      v-if="panelOpen && !fullscreen"
      class="help-backdrop open"
      aria-hidden="true"
      @click="closePanel"
    />
    <div
      class="help-widget help-widget--shell"
      :class="{ 'help-widget--fullscreen': fullscreen && panelOpen }"
      aria-live="polite"
    >
      <div
        class="help-panel help-panel--chat"
        :class="{ open: panelOpen, 'help-panel--fullscreen': fullscreen }"
        role="dialog"
        aria-label="Susan"
      >
        <header class="help-head">
          <div class="help-head-brand">
            <span class="help-head-av" aria-hidden="true">✦</span>
            <div class="help-head-title">
              <b>Susan</b>
              <small>{{ contextLabel }}</small>
            </div>
          </div>
          <div class="help-head-actions">
            <button
              type="button"
              class="help-head-btn"
              title="Clear chat"
              aria-label="Clear chat history"
              :disabled="busy"
              @click="clearChatHistory"
            >
              🗑
            </button>
            <button
              type="button"
              class="help-head-btn"
              :title="fullscreen ? 'Exit full screen' : 'Full screen'"
              :aria-label="fullscreen ? 'Exit full screen' : 'Full screen'"
              @click="toggleFullscreen"
            >
              {{ fullscreen ? '⤡' : '⤢' }}
            </button>
            <button type="button" class="help-head-btn" aria-label="Close chat" @click="closePanel">
              ✕
            </button>
          </div>
        </header>

        <div ref="msgsEl" class="help-msgs help-msgs--chat">
          <div class="help-thread">
            <div
              v-for="msg in messages"
              :key="msg.id"
              class="help-row"
              :class="msg.role"
            >
              <div v-if="msg.role !== 'user'" class="help-row-av" aria-hidden="true">
                {{ msg.role === 'typing' ? '✦' : '✦' }}
              </div>
              <div class="help-row-body">
                <div v-if="msg.role === 'user'" class="help-row-label">You</div>
                <div v-else-if="msg.role === 'assistant'" class="help-row-label">Susan</div>
                <div v-if="msg.role === 'typing'" class="help-typing">
                  <span /><span /><span />
                </div>
                <!-- eslint-disable-next-line vue/no-v-html -->
                <div v-else class="help-row-content" v-html="msg.html" />
              </div>
            </div>
          </div>
        </div>

        <footer class="help-composer">
          <div
            v-if="pendingAttachments.length"
            class="help-compose-attachments"
            aria-label="Pending attachments"
          >
            <div
              v-for="attachment in pendingAttachments"
              :key="attachment.id"
              class="help-compose-chip"
            >
              <img
                class="help-compose-chip-thumb"
                :src="attachment.dataUrl"
                :alt="attachment.name"
              >
              <span class="help-compose-chip-name" :title="attachment.name">{{ attachment.name }}</span>
              <small class="help-compose-chip-size">{{ formatFileSize(attachment.size) }}</small>
              <button
                type="button"
                class="help-compose-chip-remove"
                :aria-label="`Remove ${attachment.name}`"
                @click="removeAttachment(attachment.id)"
              >
                ✕
              </button>
            </div>
          </div>
          <p v-if="attachError" class="help-compose-attach-error">{{ attachError }}</p>
          <form class="help-composer-box" @submit="onSubmit">
            <input
              ref="imageInputRef"
              type="file"
              accept="image/jpeg,image/png,image/webp,image/gif"
              class="sr-only"
              tabindex="-1"
              multiple
              @change="onImageSelected"
            >
            <textarea
              id="help-input"
              ref="inputEl"
              v-model="input"
              rows="1"
              placeholder="Message Susan…"
              aria-label="Message Susan"
              :disabled="busy"
              @keydown="onKeydown"
              @input="resizeInput"
            />
            <div class="help-composer-toolbar">
              <button
                v-if="imageUploadEnabled"
                type="button"
                class="help-composer-icon"
                aria-label="Attach image"
                :disabled="busy || !canAddAttachments"
                :title="canAddAttachments ? 'Attach image' : `Up to ${MAX_ATTACHMENTS} attachments`"
                @click="openImagePicker"
              >
                📎
              </button>
              <button
                type="submit"
                class="help-composer-send"
                aria-label="Send message"
                :disabled="busy || (!input.trim() && !pendingAttachments.length)"
              >
                ↑
              </button>
            </div>
          </form>
          <p class="help-composer-note">
            {{ poweredByLabel }}
          </p>
        </footer>
      </div>
      <button
        v-if="!panelOpen"
        class="help-fab"
        aria-label="Open platform help"
        :aria-expanded="false"
        @click="togglePanel"
      >
        <span class="pulse" />
        ✦
      </button>
    </div>
  </template>
</template>

<style scoped>
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
</style>
