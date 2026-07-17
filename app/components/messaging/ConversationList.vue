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

const isEmail = computed(() => props.conversation.type === 'email')
const isTeam = computed(() => props.conversation.type === 'team')

const displayName = computed(() => {
  if (props.conversation.type === 'team') return props.conversation.title || 'Team'
  if (props.conversation.type === 'email') {
    return props.conversation.customer?.name || props.conversation.customer?.email || 'Email'
  }
  return props.conversation.participant.name
})

const displayEmail = computed(() => {
  if (props.conversation.type === 'team') return 'Group chat'
  if (props.conversation.type === 'email') {
    return props.conversation.customer?.email ?? ''
  }
  return props.conversation.participant.email
})

const avCls = computed(() => avColor(isTeam.value ? 'Team' : displayName.value))
const avInitials = computed(() => isTeam.value ? '👥' : initials(displayName.value))

const preview = computed(() => {
  const last = props.conversation.lastMessage
  if (!last) return isEmail.value ? 'No emails yet' : 'No messages yet'
  if (isEmail.value && props.conversation.type === 'email') {
    const prefix = last.direction === 'inbound' ? '' : 'You: '
    return prefix + messagePreviewText(last.body)
  }
  return messagePreviewText(last.body)
})

const timeLabel = computed(() =>
  props.conversation.lastMessage
    ? formatMessageTime(props.conversation.lastMessage.createdAt)
    : '',
)

const subjectLine = computed(() =>
  isEmail.value && props.conversation.type === 'email'
    ? props.conversation.subject
    : '',
)

const itemAriaLabel = computed(() => {
  if (!isEmail.value) return displayName.value
  const parts = [displayName.value]
  if (subjectLine.value) parts.push(subjectLine.value)
  if (displayEmail.value) parts.push(displayEmail.value)
  return parts.join(', ')
})

const unreadAriaLabel = computed(() =>
  props.conversation.unreadCount
    ? `${props.conversation.unreadCount} unread`
    : '',
)
</script>

<template>
  <button
    type="button"
    class="dm-conv-item"
    :class="{ on: active, unread: conversation.unreadCount > 0, 'is-email': isEmail, 'is-team': isTeam }"
    :aria-label="itemAriaLabel"
    @click="emit('select', conversation.id)"
  >
    <span class="dm-conv-av" :class="avCls" aria-hidden="true">{{ avInitials }}</span>
    <span class="dm-conv-main">
      <span class="dm-conv-top">
        <b>{{ displayName }}</b>
        <time v-if="timeLabel">{{ timeLabel }}</time>
      </span>
      <span v-if="subjectLine" class="dm-conv-subject">{{ subjectLine }}</span>
      <span class="dm-conv-preview">{{ preview }}</span>
      <small v-if="displayEmail && (isEmail || isTeam)" class="dm-conv-email">{{ displayEmail }}</small>
    </span>
    <span v-if="conversation.unreadCount" class="dm-conv-badge" :aria-label="unreadAriaLabel">
      {{ conversation.unreadCount }}
    </span>
  </button>
</template>
