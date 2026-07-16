<script setup lang="ts">
import { prepareEmailHtmlIframeDocument } from '#shared/email-display'

const props = defineProps<{
  html: string
}>()

const frameRef = ref<HTMLIFrameElement | null>(null)
const frameHeight = ref(120)

let resizeObserver: ResizeObserver | null = null
let resizeTimers: ReturnType<typeof setTimeout>[] = []

const srcdoc = computed(() => prepareEmailHtmlIframeDocument(props.html))

function injectLayoutReset(doc) {
  if (!doc.head || doc.getElementById('dm-email-layout-reset')) return
  const style = doc.createElement('style')
  style.id = 'dm-email-layout-reset'
  style.textContent = `
    html, body, body * {
      max-height: none !important;
      height: auto !important;
      min-height: 0 !important;
      overflow: visible !important;
      position: static !important;
      float: none !important;
      transform: none !important;
      clip: auto !important;
      clip-path: none !important;
      visibility: visible !important;
    }
  `
  doc.head.appendChild(style)
}

function measureFrameHeight(doc) {
  const body = doc.body
  const root = doc.documentElement
  if (!body) return 48

  injectLayoutReset(doc)

  let maxBottom = 0
  const bodyTop = body.getBoundingClientRect().top
  const nodes = body.querySelectorAll('*')
  for (const el of nodes) {
    const rect = el.getBoundingClientRect()
    if (rect.height > 0) maxBottom = Math.max(maxBottom, rect.bottom - bodyTop)
  }

  const textHeight = body.getBoundingClientRect().height
  const scrollHeight = Math.max(
    body.scrollHeight,
    body.offsetHeight,
    root?.scrollHeight ?? 0,
    root?.offsetHeight ?? 0,
    maxBottom,
    textHeight,
  )

  return scrollHeight
}

function resizeFrame() {
  const doc = frameRef.value?.contentDocument
  if (!doc) return
  const height = measureFrameHeight(doc)
  frameHeight.value = Math.min(Math.max(height + 12, 72), 20000)
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
    setTimeout(resizeFrame, 50),
    setTimeout(resizeFrame, 150),
    setTimeout(resizeFrame, 400),
    setTimeout(resizeFrame, 1000),
    setTimeout(resizeFrame, 2000),
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
  frameHeight.value = 120
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
