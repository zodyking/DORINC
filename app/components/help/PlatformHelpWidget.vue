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
const messages = ref<Array<{ role: 'user' | 'bot' | 'typing', html: string }>>([])

const canUseHelp = computed(() => auth.can('ai.help.all'))
const pageKey = computed(() => helpPageKeyFromRoute(route.path, route.query))
const contextLabel = computed(() => helpContextLabel(pageKey.value))
const suggestions = computed(() => helpSuggestionsForPage(pageKey.value))

const displayName = computed(() => auth.user?.name ?? 'there')
const avInitials = computed(() => initials(displayName.value))

const { data: helpStatus } = await useFetch<{ enabled: boolean, aiAvailable: boolean, capped: boolean }>(
  '/api/ai/help-status',
  { immediate: canUseHelp.value },
)

const widgetVisible = computed(() =>
  isPlatformHelpWidgetVisible(canUseHelp.value, helpStatus.value),
)

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
}

function togglePanel() {
  if (panelOpen.value) closePanel()
  else openPanel()
}

async function askQuestion(q: string) {
  const text = q.trim()
  if (!text || busy.value) return

  messages.value.push({ role: 'user', html: escapeHtml(text) })
  input.value = ''
  messages.value.push({ role: 'typing', html: 'Thinking…' })
  busy.value = true

  try {
    const res = await $fetch<{ answer: string, source: 'ai' | 'fallback', capped: boolean }>('/api/ai/help', {
      method: 'POST',
      body: {
        question: text,
        pageContext: contextLabel.value.replace('Viewing · ', ''),
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
      html: 'Sorry, I could not reach the help service. Try a suggested question below.',
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

onUnmounted(() => {
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
    <div class="help-widget" aria-live="polite">
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
          <form @submit="onSubmit">
            <textarea
              id="help-input"
              v-model="input"
              rows="1"
              placeholder="Ask how to use DORINC…"
              aria-label="Message"
              :disabled="busy"
              @keydown="onKeydown"
            />
            <button type="submit" class="send" aria-label="Send" :disabled="busy || !input.trim()">
              ↑
            </button>
          </form>
          <div class="hint">
            Answers are about this platform only · not invoice content
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
