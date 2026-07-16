<script setup lang="ts">
import type { ConversationSummary } from '~/composables/useDirectMessages'

const props = defineProps<{
  conversation: ConversationSummary | null
  messages: Array<{
    id: string
    senderUserId: string | null
    senderName: string
    body: string
    htmlBody?: string | null
    createdAt: string
    direction?: 'inbound' | 'outbound'
    fromAddress?: string | null
  }>
  loading?: boolean
  sending?: boolean
  currentUserId?: string
}>()

const emit = defineEmits<{
  back: []
  send: [body: string]
}>()

const auth = useAuthStore()
const msgsEl = ref<HTMLElement | null>(null)

const userId = computed(() => props.currentUserId ?? auth.user?.id ?? '')
const isEmail = computed(() => props.conversation?.type === 'email')

const peerName = computed(() => {
  if (!props.conversation) return ''
  if (props.conversation.type === 'email') {
    return props.conversation.customer?.name || props.conversation.customer?.email || 'Customer'
  }
  return props.conversation.participant.name
})

const peerEmail = computed(() => {
  if (!props.conversation) return ''
  if (props.conversation.type === 'email') {
    return props.conversation.customer?.email ?? ''
  }
  return props.conversation.participant.email
})

const emailSubject = computed(() =>
  props.conversation?.type === 'email' ? props.conversation.subject : '',
)

function isOwnMessage(msg: { senderUserId: string | null, direction?: 'inbound' | 'outbound' }) {
  if (isEmail.value) return msg.direction === 'outbound' || msg.senderUserId === userId.value
  return msg.senderUserId === userId.value
}

watch(() => props.messages.length, () => {
  nextTick(() => {
    if (msgsEl.value) msgsEl.value.scrollTop = msgsEl.value.scrollHeight
  })
})

watch(() => props.conversation?.id, () => {
  nextTick(() => {
    if (msgsEl.value) msgsEl.value.scrollTop = msgsEl.value.scrollHeight
  })
})
</script>

<template>
  <div class="dm-thread">
    <header v-if="conversation" class="dm-thread-head">
      <button type="button" class="dm-back-btn" aria-label="Back to conversations" @click="emit('back')">
        ←
      </button>
      <div class="dm-thread-peer">
        <div>
          <b>{{ peerName }}</b>
          <small>{{ peerEmail }}</small>
          <small v-if="emailSubject" class="dm-thread-subject">{{ emailSubject }}</small>
        </div>
      </div>
    </header>

    <div v-if="!conversation" class="dm-thread-empty">
      <b>Select a conversation</b>
      <span>Choose a thread from the list or start a new message.</span>
    </div>

    <div v-else ref="msgsEl" class="dm-thread-msgs" :class="{ 'is-email': isEmail }">
      <div v-if="loading" class="dm-thread-loading">Loading messages…</div>
      <template v-else-if="isEmail">
        <MessagingEmailThreadMessage
          v-for="msg in messages"
          :key="msg.id"
          :message="msg"
          :peer-email="peerEmail"
        />
      </template>
      <template v-else>
        <MessagingMessageBubble
          v-for="msg in messages"
          :key="msg.id"
          :message="msg"
          :is-own="isOwnMessage(msg)"
        />
      </template>
      <div v-if="!loading && !messages.length" class="dm-thread-loading">
        {{ isEmail ? 'No emails in this thread yet.' : `Say hello to ${peerName.split(' ')[0]}.` }}
      </div>
    </div>

    <MessagingMessageComposer
      v-if="conversation"
      :disabled="loading || sending"
      :mode="isEmail ? 'email' : 'dm'"
      @send="emit('send', $event)"
    />
  </div>
</template>
