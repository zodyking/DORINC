<script setup lang="ts">
// Floating platform help chat — staff app only (mockup: Platform help assistant / P2-15).
import { initials } from '~/utils/users-ui'
import {
  helpContextLabel,
  helpPageKeyFromRoute,
  helpSuggestionsForPage,
  isPlatformHelpWidgetVisible,
} from '~/utils/platform-help-ui'

const route = useRoute()
const auth = useAuthStore()

const panelOpen = ref(false)
const booted = ref(false)
const busy = ref(false)
const input = ref('')
const pendingImage = ref<{ dataUrl: string, name: string } | null>(null)
const messages = ref<Array<{ role: 'user' | 'bot' | 'typing', html: string }>>([])

const canUseHelp = computed(() => auth.can('ai.help.all'))
const pageKey = computed(() => helpPageKeyFromRoute(route.path, route.query))
const contextLabel = computed(() => helpContextLabel(pageKey.value))
const suggestions = computed(() => helpSuggestionsForPage(pageKey.value))

const displayName = computed(() => auth.user?.name ?? 'there')
const avInitials = computed(() => initials(displayName.value))

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

watch(pageKey, () => {
  if (panelOpen.value && booted.value) {
    // refresh suggestions when navigating with panel open
  }
})

watch(() => route.path, () => {
  if (panelOpen.value) bootChat()
})

function bootChat() {
  if (booted.value) return
  booted.value = true
  messages.value = [{
    role: 'bot',
    html: `Hi ${displayName.value.split(' ')[0]}! I'm the <b>Platform Assistant</b> — I answer questions about how to use DORINC (workflows, roles, settings). I don't edit invoice data. What can I help with?`,
  }]
}

function openPanel() {
  panelOpen.value = true
  bootChat()
  nextTick(() => {
    const el = document.getElementById('help-input') as HTMLTextAreaElement | null
    el?.focus()
  })
}

function closePanel() {
  panelOpen.value = false
  pendingImage.value = null
}

function togglePanel() {
  if (panelOpen.value) closePanel()
  else openPanel()
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
    messages.value.push({
      role: 'bot',
      html: '<p>Please attach an image under 4 MB.</p>',
    })
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

async function askQuestion(q: string) {
  const text = q.trim()
  if ((!text && !pendingImage.value) || busy.value) return

  const question = text || 'What do you see in this screenshot? How do I use this screen?'
  const userHtml = pendingImage.value
    ? `${escapeHtml(text || 'Screenshot attached')}<br><img src="${pendingImage.value.dataUrl}" alt="Attached screenshot" class="help-attached-img">`
    : escapeHtml(question)

  messages.value.push({ role: 'user', html: userHtml })
  const imageDataUrl = pendingImage.value?.dataUrl
  input.value = ''
  pendingImage.value = null
  messages.value.push({ role: 'typing', html: 'Thinking…' })
  busy.value = true

  try {
    const res = await $fetch<{ answer: string, source: 'ai' | 'fallback', capped: boolean }>('/api/ai/help', {
      method: 'POST',
      body: {
        question,
        pageContext: contextLabel.value.replace('Viewing · ', ''),
        imageDataUrl,
      },
    })
    messages.value = messages.value.filter(m => m.role !== 'typing')
    let answer = res.answer
    if (res.capped && res.source === 'fallback') {
      answer += '<br><br><small style="color:#94a3b8">AI spend cap reached — showing built-in help.</small>'
    }
    messages.value.push({ role: 'bot', html: answer })
  }
  catch {
    messages.value = messages.value.filter(m => m.role !== 'typing')
    messages.value.push({
      role: 'bot',
      html: '<p>Sorry, I could not reach the help service. Try a suggested question below.</p>',
    })
  }
  finally {
    busy.value = false
    scrollMessages()
  }
}

function onSubmit(e: Event) {
  e.preventDefault()
  askQuestion(input.value)
}

function onKeydown(e: KeyboardEvent) {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault()
    askQuestion(input.value)
  }
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

const msgsEl = ref<HTMLElement | null>(null)

function scrollMessages() {
  nextTick(() => {
    if (msgsEl.value) msgsEl.value.scrollTop = msgsEl.value.scrollHeight
  })
}

watch(panelOpen, (open) => {
  document.body.classList.toggle('help-on', open && widgetVisible.value)
  document.body.classList.toggle('help-chat-open', open)
})

const { registerWidget, unregisterWidget } = usePlatformHelpShell()

onMounted(() => {
  registerWidget({
    visible: widgetVisible,
    panelOpen,
    togglePanel,
  })
})

onUnmounted(() => {
  unregisterWidget()
  document.body.classList.remove('help-on', 'help-chat-open')
})
</script>

<template>
  <template v-if="widgetVisible">
    <div
      class="help-backdrop"
      :class="{ open: panelOpen }"
      aria-hidden="true"
      @click="closePanel"
    />
    <div class="help-widget help-widget--shell" aria-live="polite">
      <div
        class="help-panel"
        :class="{ open: panelOpen }"
        role="dialog"
        aria-label="Platform Assistant"
      >
        <header class="hh">
          <span class="av">✦</span>
          <div class="info">
            <b>Platform Assistant</b>
            <small>{{ contextLabel }}</small>
          </div>
          <button class="xbtn" aria-label="Close chat" @click="closePanel">
            ✕
          </button>
        </header>
        <div ref="msgsEl" class="help-msgs">
          <div
            v-for="(msg, i) in messages"
            :key="i"
            class="help-msg"
            :class="msg.role"
          >
            <span class="who">{{ msg.role === 'bot' || msg.role === 'typing' ? '✦' : avInitials }}</span>
            <!-- eslint-disable-next-line vue/no-v-html -->
            <div class="bubble" v-html="msg.html" />
          </div>
        </div>
        <div class="help-suggest">
          <button
            v-for="(q, i) in suggestions"
            :key="i"
            type="button"
            @click="askQuestion(q)"
          >
            {{ q }}
          </button>
        </div>
        <footer class="help-foot">
          <div v-if="pendingImage" class="help-attach-preview">
            <img :src="pendingImage.dataUrl" alt="Attachment preview">
            <span>{{ pendingImage.name }}</span>
            <button type="button" class="help-attach-clear" aria-label="Remove attachment" @click="clearPendingImage">
              ✕
            </button>
          </div>
          <form @submit="onSubmit">
            <input
              ref="imageInputRef"
              type="file"
              accept="image/jpeg,image/png,image/webp,image/gif"
              class="sr-only"
              tabindex="-1"
              @change="onImageSelected"
            >
            <button
              v-if="imageUploadEnabled"
              type="button"
              class="help-attach"
              aria-label="Attach screenshot"
              :disabled="busy"
              @click="openImagePicker"
            >
              📷
            </button>
            <textarea
              id="help-input"
              v-model="input"
              rows="1"
              placeholder="Ask how to use DORINC…"
              aria-label="Message"
              :disabled="busy"
              @keydown="onKeydown"
            />
            <button type="submit" class="send" aria-label="Send" :disabled="busy || (!input.trim() && !pendingImage)">
              ↑
            </button>
          </form>
          <div class="hint">
            Answers are about this platform only · not invoice content
            <span v-if="imageUploadEnabled"> · attach screenshots on vision models</span>
          </div>
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
