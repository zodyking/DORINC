<script setup lang="ts">
import { avColor, initials } from '~/utils/users-ui'
import { formatMessageTime } from '~/utils/messages-ui'
import { emailBodyForThreadDisplay, shouldRenderEmailAsHtml } from '#shared/email-display'
import type { ChatMessage } from '~/composables/useDirectMessages'

const props = defineProps<{
  message: ChatMessage
  peerEmail?: string
  companyEmail?: string
}>()

const isOutbound = computed(() => props.message.direction === 'outbound')
const avCls = computed(() => avColor(props.message.senderName))
const avInitials = computed(() => initials(props.message.senderName))

const addressLabel = computed(() => {
  if (isOutbound.value) {
    return props.peerEmail ? `to ${props.peerEmail}` : 'to customer'
  }
  return props.message.fromAddress || props.peerEmail || ''
})

const useHtmlFrame = computed(() =>
  shouldRenderEmailAsHtml(props.message.htmlBody, props.message.direction),
)

const rendered = computed(() =>
  emailBodyForThreadDisplay(props.message.body, props.message.htmlBody, props.message.direction),
)
</script>

<template>
  <article class="dm-email-msg" :class="{ outbound: isOutbound }">
    <header class="dm-email-msg-head">
      <span class="dm-email-msg-av" :class="avCls">{{ avInitials }}</span>
      <div class="dm-email-msg-from">
        <div class="dm-email-msg-from-row">
          <b>{{ message.senderName }}</b>
          <time :datetime="message.createdAt">{{ formatMessageTime(message.createdAt) }}</time>
        </div>
        <small v-if="addressLabel" class="dm-email-msg-addr">{{ addressLabel }}</small>
      </div>
    </header>
    <div
      class="dm-email-msg-body"
      :class="{ 'dm-email-msg-body--html': useHtmlFrame }"
    >
      <MessagingEmailHtmlFrame
        v-if="useHtmlFrame && message.htmlBody"
        :html="message.htmlBody"
      />
      <!-- eslint-disable-next-line vue/no-v-html -->
      <div v-else class="dm-email-text" v-html="rendered.content" />
    </div>
  </article>
</template>
