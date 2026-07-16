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

const htmlBody = ref<string | null>(props.message.htmlBody ?? null)
const loadingHtml = ref(false)

watch(() => props.message, async (message) => {
  htmlBody.value = message.htmlBody ?? null
  if (htmlBody.value || !message.hasHtmlBody) return

  loadingHtml.value = true
  try {
    const res = await $fetch<{ htmlBody: string | null }>(
      `/api/conversations/${message.conversationId}/messages/${message.id}/html`,
    )
    htmlBody.value = res.htmlBody
  }
  catch {
    htmlBody.value = null
  }
  finally {
    loadingHtml.value = false
  }
}, { immediate: true })

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
  shouldRenderEmailAsHtml(htmlBody.value, props.message.body, props.message.direction),
)

const rendered = computed(() =>
  emailBodyForThreadDisplay(props.message.body, htmlBody.value, props.message.direction),
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
      <div v-if="loadingHtml" class="dm-email-empty">Loading email…</div>
      <MessagingEmailHtmlFrame
        v-else-if="useHtmlFrame && htmlBody"
        :html="htmlBody"
      />
      <!-- eslint-disable-next-line vue/no-v-html -->
      <div v-else class="dm-email-text" v-html="rendered.content" />
    </div>
    <MessagingEmailMessageAttachments
      v-if="message.attachments?.length"
      :conversation-id="message.conversationId"
      :message-id="message.id"
      :attachments="message.attachments"
    />
  </article>
</template>
