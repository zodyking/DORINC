<script setup lang="ts">
import type { ChatMessage, ConversationSummary } from '~/composables/useDirectMessages'

const props = defineProps<{
  conversation: ConversationSummary | null
  messages: ChatMessage[]
  loading?: boolean
  sending?: boolean
  currentUserId?: string
  hideBack?: boolean
  teamOnly?: boolean
}>()

const emit = defineEmits<{
  back: []
  send: [body: string, files: File[]]
  'deletion-requested': []
}>()

const auth = useAuthStore()
const msgsEl = ref<HTMLElement | null>(null)

const userId = computed(() => props.currentUserId ?? auth.user?.id ?? '')
const isEmail = computed(() => props.conversation?.type === 'email')
const isTeam = computed(() => props.conversation?.type === 'team')

const peerName = computed(() => {
  if (!props.conversation) return ''
  if (props.conversation.type === 'team') return props.conversation.title || 'Team'
  if (props.conversation.type === 'email') {
    return props.conversation.customer?.name || props.conversation.customer?.email || 'Customer'
  }
  return props.conversation.participant.name
})

const peerEmail = computed(() => {
  if (!props.conversation) return ''
  if (isTeam.value) return 'Everyone on staff'
  if (props.conversation.type === 'email') {
    return props.conversation.customer?.email ?? ''
  }
  return props.conversation.participant.email
})

const emailSubject = computed(() =>
  props.conversation?.type === 'email' ? props.conversation.subject : '',
)

const conversationLabel = computed(() => {
  if (!props.conversation) return ''
  if (props.conversation.type === 'team') return props.conversation.title || 'Team'
  if (props.conversation.type === 'email') {
    return emailSubject.value || peerName.value || 'Email thread'
  }
  return peerName.value || 'Direct message'
})

function onDeletionRequested() {
  emit('deletion-requested')
}

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
      <button
        v-if="!hideBack"
        type="button"
        class="dm-back-btn"
        aria-label="Back to conversations"
        @click="emit('back')"
      >
        ←
      </button>
      <div class="dm-thread-peer">
        <div>
          <b>{{ peerName }}</b>
          <small>{{ peerEmail }}</small>
          <small v-if="emailSubject" class="dm-thread-subject">{{ emailSubject }}</small>
        </div>
      </div>
      <div class="dm-thread-actions">
        <DeleteEntityButton
          v-if="!isEmail"
          entity-type="conversation"
          :entity-id="conversation.id"
          :entity-label="conversationLabel"
          title="Request thread deletion"
          @submitted="onDeletionRequested"
        />
      </div>
    </header>

    <div v-if="!conversation && loading" class="dm-thread-loading dm-thread-loading--solo">
      Loading team chat…
    </div>

    <div v-else-if="!conversation" class="dm-thread-empty">
      <b>{{ teamOnly ? 'Team chat unavailable' : 'Select a conversation' }}</b>
      <span v-if="teamOnly">Could not open the shared team thread. Try again in a moment.</span>
      <span v-else>Choose a thread from the list or start a new message.</span>
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
        {{ isEmail ? 'No emails in this thread yet.' : isTeam ? 'No team messages yet.' : `Say hello to ${peerName.split(' ')[0]}.` }}
      </div>
    </div>

    <MessagingMessageComposer
      v-if="conversation"
      :disabled="loading || sending"
      :mode="isEmail ? 'email' : 'dm'"
      @send="(body, files) => emit('send', body, files)"
    />
  </div>
</template>
