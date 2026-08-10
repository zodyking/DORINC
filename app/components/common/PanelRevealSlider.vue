<script setup lang="ts">
/**
 * Before/after reveal for two panels (e.g. Service Log vs line items).
 * Primary control is a top track with a ball thumb; edge-snaps on release.
 */
const props = withDefaults(defineProps<{
  /** Percent of the reveal (left) panel visible, 0–100. */
  modelValue?: number
  revealLabel?: string
  baseLabel?: string
  minHeight?: string
}>(), {
  modelValue: 50,
  revealLabel: 'Photos',
  baseLabel: 'Line items',
  minHeight: '440px',
})

const emit = defineEmits<{
  'update:modelValue': [value: number]
}>()

const EDGE_SNAP = 12

const rootRef = ref<HTMLElement | null>(null)
const trackRef = ref<HTMLElement | null>(null)
const dragging = ref(false)

const percent = computed({
  get: () => Math.min(100, Math.max(0, Number(props.modelValue) || 0)),
  set: (value: number) => emit('update:modelValue', Math.min(100, Math.max(0, value))),
})

const rootWidth = ref(0)

function measure() {
  rootWidth.value = rootRef.value?.getBoundingClientRect().width ?? 0
}

function setFromClientX(clientX: number, el: HTMLElement | null) {
  if (!el) return
  const rect = el.getBoundingClientRect()
  if (rect.width <= 0) return
  percent.value = ((clientX - rect.left) / rect.width) * 100
}

function snapEdges(value: number) {
  if (value <= EDGE_SNAP) return 0
  if (value >= 100 - EDGE_SNAP) return 100
  return value
}

function onTrackPointerDown(event: PointerEvent) {
  const target = event.currentTarget as HTMLElement
  target.setPointerCapture(event.pointerId)
  dragging.value = true
  measure()
  setFromClientX(event.clientX, trackRef.value)
  event.preventDefault()
}

function onTrackPointerMove(event: PointerEvent) {
  if (!dragging.value) return
  setFromClientX(event.clientX, trackRef.value)
}

function onTrackPointerUp(event: PointerEvent) {
  if (!dragging.value) return
  dragging.value = false
  percent.value = snapEdges(percent.value)
  try {
    (event.currentTarget as HTMLElement).releasePointerCapture(event.pointerId)
  }
  catch {
    // already released
  }
}

function onKeydown(event: KeyboardEvent) {
  const step = event.shiftKey ? 10 : 4
  if (event.key === 'ArrowLeft') {
    event.preventDefault()
    percent.value = snapEdges(percent.value - step)
  }
  else if (event.key === 'ArrowRight') {
    event.preventDefault()
    percent.value = snapEdges(percent.value + step)
  }
  else if (event.key === 'Home') {
    event.preventDefault()
    percent.value = 0
  }
  else if (event.key === 'End') {
    event.preventDefault()
    percent.value = 100
  }
}

let resizeObserver: ResizeObserver | null = null

onMounted(() => {
  measure()
  if (!import.meta.client || !rootRef.value) return
  resizeObserver = new ResizeObserver(() => measure())
  resizeObserver.observe(rootRef.value)
})

onBeforeUnmount(() => {
  resizeObserver?.disconnect()
  resizeObserver = null
})
</script>

<template>
  <div
    ref="rootRef"
    class="reveal-slider"
    :class="{ 'reveal-slider--dragging': dragging }"
    :style="{ minHeight }"
  >
    <div class="reveal-slider__control">
      <span class="reveal-slider__end-label">{{ revealLabel }}</span>
      <div
        ref="trackRef"
        class="reveal-slider__track"
        role="slider"
        tabindex="0"
        :aria-valuemin="0"
        :aria-valuemax="100"
        :aria-valuenow="Math.round(percent)"
        :aria-label="`Reveal ${revealLabel} over ${baseLabel}`"
        @pointerdown="onTrackPointerDown"
        @pointermove="onTrackPointerMove"
        @pointerup="onTrackPointerUp"
        @pointercancel="onTrackPointerUp"
        @keydown="onKeydown"
      >
        <div class="reveal-slider__track-fill" :style="{ width: `${percent}%` }" />
        <div
          class="reveal-slider__thumb"
          :style="{ left: `${percent}%` }"
          aria-hidden="true"
        />
      </div>
      <span class="reveal-slider__end-label">{{ baseLabel }}</span>
    </div>

    <div class="reveal-slider__stage">
      <div class="reveal-slider__base" :aria-hidden="percent >= 98">
        <div class="reveal-slider__panel-label">{{ baseLabel }}</div>
        <div class="reveal-slider__panel-body">
          <slot name="base" />
        </div>
      </div>

      <div
        class="reveal-slider__reveal"
        :style="{ width: `${percent}%` }"
        :aria-hidden="percent <= 2"
      >
        <div
          class="reveal-slider__reveal-inner"
          :style="{ width: rootWidth ? `${rootWidth}px` : '100%' }"
        >
          <div class="reveal-slider__panel-label">{{ revealLabel }}</div>
          <div class="reveal-slider__panel-body">
            <slot name="reveal" />
          </div>
        </div>
      </div>

      <div
        class="reveal-slider__divider"
        :style="{ left: `${percent}%` }"
        aria-hidden="true"
      />
    </div>
  </div>
</template>

<style scoped>
.reveal-slider {
  display: flex;
  flex-direction: column;
  gap: 12px;
  min-width: 0;
}

.reveal-slider__control {
  display: grid;
  grid-template-columns: auto 1fr auto;
  align-items: center;
  gap: 10px;
  padding: 2px 2px 0;
}

.reveal-slider__end-label {
  font-size: 11.5px;
  font-weight: 700;
  color: #64748b;
  white-space: nowrap;
}

.reveal-slider__track {
  position: relative;
  height: 28px;
  display: flex;
  align-items: center;
  cursor: pointer;
  touch-action: none;
  outline: none;
  border-radius: 999px;
}

.reveal-slider__track::before {
  content: '';
  position: absolute;
  left: 0;
  right: 0;
  height: 6px;
  border-radius: 999px;
  background: #e2e8f0;
}

.reveal-slider__track:focus-visible .reveal-slider__thumb {
  box-shadow: 0 0 0 3px rgba(99, 102, 241, 0.35), 0 2px 8px rgba(15, 23, 42, 0.2);
}

.reveal-slider__track-fill {
  position: absolute;
  left: 0;
  height: 6px;
  border-radius: 999px;
  background: linear-gradient(90deg, #818cf8, #6366f1);
  pointer-events: none;
}

.reveal-slider__thumb {
  position: absolute;
  top: 50%;
  width: 22px;
  height: 22px;
  margin-left: -11px;
  transform: translateY(-50%);
  border-radius: 50%;
  background: #fff;
  border: 2px solid #6366f1;
  box-shadow: 0 2px 8px rgba(15, 23, 42, 0.18);
  pointer-events: none;
  transition: box-shadow 0.15s ease;
}

.reveal-slider--dragging .reveal-slider__thumb {
  transform: translateY(-50%) scale(1.08);
  box-shadow: 0 0 0 4px rgba(99, 102, 241, 0.2), 0 3px 10px rgba(15, 23, 42, 0.22);
}

.reveal-slider__stage {
  position: relative;
  flex: 1 1 auto;
  min-height: inherit;
  border: 1px solid #e2e8f0;
  border-radius: 12px;
  overflow: hidden;
  background: #fff;
}

.reveal-slider__base,
.reveal-slider__reveal-inner {
  min-height: inherit;
  height: 100%;
  display: flex;
  flex-direction: column;
  background: #fff;
}

.reveal-slider__base {
  width: 100%;
}

.reveal-slider__reveal {
  position: absolute;
  inset: 0 auto 0 0;
  overflow: hidden;
  z-index: 2;
  background: #fff;
  pointer-events: auto;
}

.reveal-slider__divider {
  position: absolute;
  top: 0;
  bottom: 0;
  width: 2px;
  margin-left: -1px;
  z-index: 3;
  background: #6366f1;
  pointer-events: none;
  box-shadow: 0 0 0 1px rgba(255, 255, 255, 0.7);
}

.reveal-slider__panel-label {
  flex: none;
  padding: 10px 14px;
  border-bottom: 1px solid #e2e8f0;
  background: #f8fafc;
  font-size: 12px;
  font-weight: 700;
  color: #475569;
  letter-spacing: 0.02em;
}

.reveal-slider__panel-body {
  flex: 1 1 auto;
  min-height: 0;
  overflow: auto;
  padding: 12px;
}

.reveal-slider--dragging {
  user-select: none;
}

.reveal-slider--dragging .reveal-slider__panel-body {
  pointer-events: none;
}

@media (max-width: 720px) {
  .reveal-slider__control {
    gap: 8px;
  }

  .reveal-slider__end-label {
    font-size: 11px;
    max-width: 72px;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .reveal-slider__stage {
    min-height: 360px;
  }
}
</style>
