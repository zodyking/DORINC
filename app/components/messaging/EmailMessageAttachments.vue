<script setup lang="ts">
import type { EmailAttachment } from '~/composables/useDirectMessages'

const props = defineProps<{
  conversationId: string
  messageId: string
  attachments: EmailAttachment[]
}>()

function attachmentUrl(fileId: string, action: 'preview' | 'download'): string {
  return `/api/conversations/${props.conversationId}/messages/${props.messageId}/attachments/${fileId}/${action}`
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}

function isImage(attachment: EmailAttachment): boolean {
  return attachment.mimeType.startsWith('image/')
}
</script>

<template>
  <section v-if="attachments.length" class="dm-email-attachments" aria-label="Email attachments">
    <div class="dm-email-attachments-title">
      {{ attachments.length === 1 ? 'Attachment' : `${attachments.length} attachments` }}
    </div>

    <div class="dm-email-attachment-list">
      <article
        v-for="attachment in attachments"
        :key="attachment.id"
        class="dm-email-attachment"
        :class="{ 'is-image': isImage(attachment) }"
      >
        <a
          v-if="isImage(attachment)"
          class="dm-email-attachment-preview"
          :href="attachmentUrl(attachment.id, 'preview')"
          target="_blank"
          rel="noopener noreferrer"
          :aria-label="`Open ${attachment.filename}`"
        >
          <img
            :src="attachmentUrl(attachment.id, 'preview')"
            :alt="attachment.filename"
            loading="lazy"
          >
        </a>
        <div v-else class="dm-email-attachment-icon" aria-hidden="true">📎</div>

        <div class="dm-email-attachment-meta">
          <span :title="attachment.filename">{{ attachment.filename }}</span>
          <small>{{ formatFileSize(attachment.fileSizeBytes) }}</small>
        </div>

        <a
          class="dm-email-attachment-download"
          :href="attachmentUrl(attachment.id, 'download')"
          :aria-label="`Download ${attachment.filename}`"
        >
          Download
        </a>
      </article>
    </div>
  </section>
</template>
