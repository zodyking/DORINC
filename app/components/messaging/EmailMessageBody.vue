<script setup lang="ts">
import { emailBodyForDisplay } from '#shared/email-display'

const props = defineProps<{
  body: string
  htmlBody?: string | null
}>()

const rendered = computed(() => emailBodyForDisplay(props.body, props.htmlBody))
</script>

<template>
  <div
    class="dm-email-body"
    :class="{ 'dm-email-body--html': rendered.mode === 'html' }"
  >
    <!-- eslint-disable-next-line vue/no-v-html -->
    <div v-if="rendered.mode === 'html'" class="dm-email-html" v-html="rendered.content" />
    <!-- eslint-disable-next-line vue/no-v-html -->
    <div v-else class="dm-email-text" v-html="rendered.content" />
  </div>
</template>
