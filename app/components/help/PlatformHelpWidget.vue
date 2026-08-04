<script setup lang="ts">
// Platform help chat — staff app (ChatGPT-style UI with vision support).
import {
  helpContextLabel,
  helpPageKeyFromRoute,
  isPlatformHelpWidgetVisible,
} from '~/utils/platform-help-ui'

interface ChatMessage {
  id: string
  role: 'user' | 'assistant' | 'typing'
  html: string
  text: string
  imageDataUrl?: string
}

const route = useRoute()
const auth = useAuthStore()

const panelOpen = ref(false)
const fullscreen = ref(false)
const busy = ref(false)
const input = ref('')
const pendingImage = ref<{ dataUrl: string, name: string } | null>(null)
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
}>(
  '/api/ai/help-status',
  { immediate: false },
)

watch([() => auth.loaded, canUseHelp], ([loaded, can]) => {
  if (loaded && can) refreshHelpStatus()
}, { immediate: true })

const widgetVisible = computed(() =>
  isPlatformHelpWidgetVisible(canUseHelp.value, helpStatus.value),
)

const imageUploadEnabled = computed(() => Boolean(helpStatus.value?.imageUploadEnabled))

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

function welcomeMessage(): ChatMessage {
  const first = displayName.value.split(' ')[0]
  const html = `<p>Hi ${first}! I'm your <b>Platform Assistant</b>. Ask how to use DORINC, or attach a screenshot and I'll walk you through what I see.</p>`
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

function persistMessages() {
  if (!import.meta.client) return
  const toStore = messages.value.filter(m => m.role !== 'typing')
  sessionStorage.setItem(storageKey.value, JSON.stringify(toStore))
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
  pendingImage.value = null
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
  pendingImage.value = null
  input.value = ''
  sessionStorage.removeItem(storageKey.value)
}

const imageInputRef = ref<HTMLInputElement | null>(null)

function openImagePicker() {
  imageInputRef.value?.click()
}

async function onImageSelected(event: Event) {
  const file = (event.target as HTMLInputElement).files?.[0]
  if (!file) return
  if (!file.type.startsWith('image/')) return
  if (file.size > 4 * 1024 * 1024) {
    pushAssistant('<p>Please attach an image under 4 MB.</p>')
    return
  }
  const dataUrl = await readFileAsDataUrl(file)
  pendingImage.value = { dataUrl, name: file.name }
  ;(event.target as HTMLInputElement).value = ''
}

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result ?? ''))
    reader.onerror = () => reject(reader.error)
    reader.readAsDataURL(file)
  })
}

function clearPendingImage() {
  pendingImage.value = null
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
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
      content: m.text,
    }))
}

async function sendMessage() {
  const text = input.value.trim()
  if ((!text && !pendingImage.value) || busy.value) return

  const question = text || 'What is in this image? Describe it in detail and explain what it is used for.'
  const imageDataUrl = pendingImage.value?.dataUrl
  const userHtml = imageDataUrl
    ? `${escapeHtml(text || 'What is in this image?')}<div class="help-attached-wrap"><img src="${imageDataUrl}" alt="Attached image" class="help-attached-img"></div>`
    : escapeHtml(question)

  messages.value.push({
    id: createId(),
    role: 'user',
    html: userHtml,
    text: question,
    imageDataUrl,
  })
  input.value = ''
  pendingImage.value = null
  resizeInput()
  messages.value.push({ id: 'typing', role: 'typing', html: '', text: '' })
  busy.value = true
  scrollMessages()

  try {
    const res = await $fetch<{ answer: string, source: 'ai' | 'fallback', capped: boolean }>('/api/ai/help', {
      method: 'POST',
      body: {
        question,
        pageContext: contextLabel.value.replace('Viewing · ', ''),
        imageDataUrl,
        history: buildApiHistory().slice(0, -1),
      },
    })
    messages.value = messages.value.filter(m => m.role !== 'typing')
    let answer = res.answer
    if (res.capped && res.source === 'fallback' && !imageDataUrl) {
      answer += '<p><small>AI spend cap reached — showing built-in help where possible.</small></p>'
    }
    pushAssistant(answer)
  }
  catch {
    messages.value = messages.value.filter(m => m.role !== 'typing')
    pushAssistant('<p>Sorry, I could not reach the help service. Check your connection and try again.</p>')
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
        aria-label="Platform Assistant"
      >
        <header class="help-head">
          <div class="help-head-brand">
            <span class="help-head-av" aria-hidden="true">✦</span>
            <div class="help-head-title">
              <b>Platform Assistant</b>
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
                <div v-else-if="msg.role === 'assistant'" class="help-row-label">Assistant</div>
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
          <div v-if="pendingImage" class="help-attach-preview">
            <img :src="pendingImage.dataUrl" alt="Attachment preview">
            <span>{{ pendingImage.name }}</span>
            <button type="button" class="help-attach-clear" aria-label="Remove attachment" @click="clearPendingImage">
              ✕
            </button>
          </div>
          <form class="help-composer-box" @submit="onSubmit">
            <input
              ref="imageInputRef"
              type="file"
              accept="image/jpeg,image/png,image/webp,image/gif"
              class="sr-only"
              tabindex="-1"
              @change="onImageSelected"
            >
            <textarea
              id="help-input"
              ref="inputEl"
              v-model="input"
              rows="1"
              placeholder="Message Platform Assistant…"
              aria-label="Message"
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
                :disabled="busy"
                @click="openImagePicker"
              >
                📎
              </button>
              <button
                type="submit"
                class="help-composer-send"
                aria-label="Send message"
                :disabled="busy || (!input.trim() && !pendingImage)"
              >
                ↑
              </button>
            </div>
          </form>
          <p class="help-composer-note">
            Platform help only · attach screenshots for vision models
          </p>
        </footer>
      </div>
      <button
        class="help-fab"
        :class="{ open: panelOpen }"
        aria-label="Open platform help"
        :aria-expanded="panelOpen"
        @click="togglePanel"
      >
        <span v-if="!panelOpen" class="pulse" />
        {{ panelOpen ? '✕' : '✦' }}
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
