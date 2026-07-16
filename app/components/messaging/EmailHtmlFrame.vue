<script setup lang="ts">
import { prepareEmailHtmlIframeDocument } from '#shared/email-display'

const props = defineProps<{
  html: string
}>()

const frameRef = ref<HTMLIFrameElement | null>(null)
const frameHeight = ref(96)
let resizeObserver: ResizeObserver | null = null

const srcdoc = computed(() => prepareEmailHtmlIframeDocument(props.html))

function stopObserving() {
  resizeObserver?.disconnect()
  resizeObserver = null
}

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
  frameHeight.value = Math.min(Math.max(height + 4, 48), 50000)

  if (!resizeObserver && typeof ResizeObserver !== 'undefined' && body) {
    resizeObserver = new ResizeObserver(() => {
      requestAnimationFrame(resizeFrame)
    })
    resizeObserver.observe(body)
  }

  for (const image of Array.from(doc.images)) {
    if (!image.complete) {
      image.addEventListener('load', resizeFrame, { once: true })
      image.addEventListener('error', resizeFrame, { once: true })
    }
  }
}

watch(srcdoc, () => {
  stopObserving()
  frameHeight.value = 96
  nextTick(() => resizeFrame())
})

onBeforeUnmount(stopObserving)
</script>

<template>
  <iframe
    ref="frameRef"
    class="dm-email-html-frame"
    :style="{ height: `${frameHeight}px` }"
    sandbox="allow-same-origin"
    referrerpolicy="no-referrer"
    :srcdoc="srcdoc"
    title="Email message content"
    @load="resizeFrame"
  />
</template>
