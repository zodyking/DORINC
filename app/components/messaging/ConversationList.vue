<script setup lang="ts">
import { avColor, initials } from '~/utils/users-ui'
import { formatMessageTime, messagePreviewText } from '~/utils/messages-ui'
import type { ConversationSummary } from '~/composables/useDirectMessages'

const props = defineProps<{
  conversation: ConversationSummary
  active: boolean
}>()

const emit = defineEmits<{
  select: [id: string]
}>()

const avCls = computed(() => avColor(props.conversation.participant.name))
const avInitials = computed(() => initials(props.conversation.participant.name))
const preview = computed(() =>
  props.conversation.lastMessage
    ? messagePreviewText(props.conversation.lastMessage.body)
    : 'No messages yet',
)
const timeLabel = computed(() =>
  props.conversation.lastMessage
    ? formatMessageTime(props.conversation.lastMessage.createdAt)
    : '',
)
</script>

<template>
  <button
    type="button"
    class="dm-conv-item"
    :class="{ on: active, unread: conversation.unreadCount > 0 }"
    @click="emit('select', conversation.id)"
  >
    <span class="dm-conv-av" :class="avCls">{{ avInitials }}</span>
    <span class="dm-conv-main">
      <span class="dm-conv-top">
        <b>{{ conversation.participant.name }}</b>
        <time v-if="timeLabel">{{ timeLabel }}</time>
      </span>
      <span class="dm-conv-preview">{{ preview }}</span>
    </span>
    <span v-if="conversation.unreadCount" class="dm-conv-badge">{{ conversation.unreadCount }}</span>
  </button>
</template>
