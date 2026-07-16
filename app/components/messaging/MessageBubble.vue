<script setup lang="ts">
import { avColor, initials } from '~/utils/users-ui'
import { formatMessageTime } from '~/utils/messages-ui'
import type { ChatMessage } from '~/composables/useDirectMessages'

const props = defineProps<{
  message: ChatMessage
  isOwn: boolean
  isEmail?: boolean
}>()

const avCls = computed(() => avColor(props.message.senderName))
const avInitials = computed(() => initials(props.message.senderName))
</script>

<template>
  <div class="dm-msg" :class="{ own: isOwn, inbound: isEmail && !isOwn }">
    <span class="dm-msg-av" :class="avCls">{{ avInitials }}</span>
    <div class="dm-msg-body">
      <div class="dm-msg-meta">
        <b>{{ message.senderName }}</b>
        <time :datetime="message.createdAt">{{ formatMessageTime(message.createdAt) }}</time>
      </div>
      <div class="dm-msg-bubble">
        <MessagingMessageBody :body="message.body" />
      </div>
    </div>
  </div>
</template>
