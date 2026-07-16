<script setup lang="ts">
import { prepareEmailHtmlIframeDocument } from '#shared/email-display'

const props = defineProps<{
  html: string
}>()

const frameRef = ref<HTMLIFrameElement | null>(null)
const frameHeight = ref(96)

const srcdoc = computed(() => prepareEmailHtmlIframeDocument(props.html))

function resizeFrame() {
  const doc = frameRef.value?.contentDocument
  if (!doc) return
  const body = doc.body
  const root = doc.documentElement
  const height = Math.max(
    body?.scrollHeight ?? 0,
    body?.offsetHeight ?? 0,
    root?.scrollHeight ?? 0,
    root?.offsetHeight ?? 0,
  )
  frameHeight.value = Math.min(Math.max(height + 4, 48), 8000)
}

watch(srcdoc, () => {
  frameHeight.value = 96
  nextTick(() => resizeFrame())
})
</script>

<template>
  <iframe
    ref="frameRef"
    class="dm-email-html-frame"
    :style="{ height: `${frameHeight}px` }"
    sandbox=""
    referrerpolicy="no-referrer"
    :srcdoc="srcdoc"
    title="Email message content"
    @load="resizeFrame"
  />
</template>
