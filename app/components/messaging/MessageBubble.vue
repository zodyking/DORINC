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

const imageAttachments = computed(() =>
  (props.message.attachments ?? []).filter(a => a.mimeType.startsWith('image/')),
)

const showBody = computed(() => {
  const body = props.message.body.trim()
  return body && body !== '(photo)'
})

function attachmentUrl(fileId: string, action: 'preview' | 'download'): string {
  return `/api/conversations/${props.message.conversationId}/messages/${props.message.id}/attachments/${fileId}/${action}`
}
</script>

<template>
  <div class="dm-msg" :class="{ own: isOwn, inbound: isEmail && !isOwn }">
    <span class="dm-msg-av" :class="avCls">{{ avInitials }}</span>
    <div class="dm-msg-body">
      <div class="dm-msg-meta">
        <b>{{ message.senderName }}</b>
        <time :datetime="message.createdAt">{{ formatMessageTime(message.createdAt) }}</time>
      </div>
      <div class="dm-msg-bubble" :class="{ 'dm-msg-bubble-email': isEmail }">
        <div v-if="imageAttachments.length && !isEmail" class="dm-msg-images">
          <a
            v-for="attachment in imageAttachments"
            :key="attachment.id"
            class="dm-msg-image-link"
            :href="attachmentUrl(attachment.id, 'preview')"
            target="_blank"
            rel="noopener noreferrer"
          >
            <img
              :src="attachmentUrl(attachment.id, 'preview')"
              :alt="attachment.filename"
              loading="lazy"
            >
          </a>
        </div>
        <MessagingEmailMessageBody
          v-if="isEmail"
          :body="message.body"
          :html-body="message.htmlBody"
        />
        <MessagingMessageBody v-else-if="showBody" :body="message.body" />
      </div>
    </div>
  </div>
</template>
