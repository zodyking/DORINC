<script setup lang="ts">
import { prepareEmailHtmlIframeDocument } from '#shared/email-display'

const props = defineProps<{
  html: string
}>()

const frameRef = ref<HTMLIFrameElement | null>(null)
const frameHeight = ref(96)

let resizeObserver: ResizeObserver | null = null
let resizeTimers: ReturnType<typeof setTimeout>[] = []

const srcdoc = computed(() => prepareEmailHtmlIframeDocument(props.html))

function measureFrameHeight(doc: Document): number {
  const body = doc.body
  const root = doc.documentElement
  if (!body) return 48

  body.style.height = 'auto'
  body.style.maxHeight = 'none'
  body.style.overflow = 'visible'
  if (root) {
    root.style.height = 'auto'
    root.style.maxHeight = 'none'
    root.style.overflow = 'visible'
  }

  let maxBottom = 0
  const bodyTop = body.getBoundingClientRect().top
  for (const el of body.querySelectorAll('*')) {
    const rect = el.getBoundingClientRect()
    if (rect.height > 0) maxBottom = Math.max(maxBottom, rect.bottom - bodyTop)
  }

  return Math.max(
    body.scrollHeight,
    body.offsetHeight,
    root?.scrollHeight ?? 0,
    root?.offsetHeight ?? 0,
    maxBottom,
    body.getBoundingClientRect().height,
  )
}

function resizeFrame() {
  const doc = frameRef.value?.contentDocument
  if (!doc) return
  const height = measureFrameHeight(doc)
  frameHeight.value = Math.min(Math.max(height + 8, 48), 16000)
}

function clearResizeTimers() {
  for (const timer of resizeTimers) clearTimeout(timer)
  resizeTimers = []
}

function scheduleResizes() {
  clearResizeTimers()
  resizeFrame()
  requestAnimationFrame(() => {
    resizeFrame()
    requestAnimationFrame(resizeFrame)
  })
  resizeTimers.push(
    setTimeout(resizeFrame, 100),
    setTimeout(resizeFrame, 400),
    setTimeout(resizeFrame, 1000),
  )
}

function attachResizeObserver() {
  resizeObserver?.disconnect()
  const body = frameRef.value?.contentDocument?.body
  if (!body || typeof ResizeObserver === 'undefined') return

  resizeObserver = new ResizeObserver(() => resizeFrame())
  resizeObserver.observe(body)

  for (const img of body.querySelectorAll('img')) {
    if (!img.complete) {
      img.addEventListener('load', resizeFrame, { once: true })
      img.addEventListener('error', resizeFrame, { once: true })
    }
  }
}

function onFrameLoad() {
  scheduleResizes()
  attachResizeObserver()
}

watch(srcdoc, () => {
  frameHeight.value = 96
  resizeObserver?.disconnect()
  clearResizeTimers()
  nextTick(() => scheduleResizes())
})

onUnmounted(() => {
  resizeObserver?.disconnect()
  clearResizeTimers()
})
</script>

<template>
  <iframe
    ref="frameRef"
    class="dm-email-html-frame"
    :style="{ height: `${frameHeight}px` }"
    sandbox=""
    referrerpolicy="no-referrer"
    scrolling="no"
    :srcdoc="srcdoc"
    title="Email message content"
    @load="onFrameLoad"
  />
</template>
