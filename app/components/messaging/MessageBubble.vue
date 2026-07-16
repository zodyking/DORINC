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
    <span v-if="!isEmail || isOwn" class="dm-msg-av" :class="avCls">{{ avInitials }}</span>
    <span v-else class="dm-msg-av dm-conv-av-gmail">
      <img src="/icons/gmail.svg" alt="" class="dm-gmail-icon" width="16" height="16">
    </span>
    <div class="dm-msg-body">
      <div class="dm-msg-meta">
        <b>{{ message.senderName }}</b>
        <time :datetime="message.createdAt">{{ formatMessageTime(message.createdAt) }}</time>
      </div>
      <div class="dm-msg-bubble" :class="{ 'dm-msg-bubble-email': isEmail }">
        <MessagingEmailMessageBody
          v-if="isEmail"
          :body="message.body"
          :html-body="message.htmlBody"
        />
        <MessagingMessageBody v-else :body="message.body" />
      </div>
    </div>
  </div>
</template>
