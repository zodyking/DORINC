<script setup lang="ts">
import type { ConversationSummary } from '~/composables/useDirectMessages'

const props = defineProps<{
  conversation: ConversationSummary | null
  messages: Array<{
    id: string
    senderUserId: string
    senderName: string
    body: string
    createdAt: string
  }>
  loading?: boolean
  currentUserId?: string
}>()

const emit = defineEmits<{
  back: []
  send: [body: string]
}>()

const auth = useAuthStore()
const msgsEl = ref<HTMLElement | null>(null)

const userId = computed(() => props.currentUserId ?? auth.user?.id ?? '')

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
  <section class="dm-thread">
    <header v-if="conversation" class="dm-thread-head">
      <button type="button" class="dm-back-btn" aria-label="Back to conversations" @click="emit('back')">
        ←
      </button>
      <div class="dm-thread-peer">
        <b>{{ conversation.participant.name }}</b>
        <small>{{ conversation.participant.email }}</small>
      </div>
    </header>

    <div v-if="!conversation" class="dm-thread-empty">
      <b>Select a conversation</b>
      <span>Choose someone from the list or start a new message.</span>
    </div>

    <div v-else ref="msgsEl" class="dm-thread-msgs">
      <div v-if="loading" class="dm-thread-loading">Loading messages…</div>
      <MessagingMessageBubble
        v-for="msg in messages"
        :key="msg.id"
        :message="msg"
        :is-own="msg.senderUserId === userId"
      />
      <div v-if="!loading && !messages.length" class="dm-thread-loading">
        Say hello to {{ conversation.participant.name.split(' ')[0] }}.
      </div>
    </div>

    <MessagingMessageComposer
      v-if="conversation"
      :disabled="loading"
      @send="emit('send', $event)"
    />
  </section>
</template>
