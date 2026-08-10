<script setup lang="ts">
/**
 * Before/after style reveal slider for two interactive panels
 * (e.g. service-log photos vs invoice line items).
 * Left/reveal panel is clipped over the base panel; drag the handle to mix.
 */
const props = withDefaults(defineProps<{
  /** Percent of the reveal (left) panel visible, 0–100. */
  modelValue?: number
  revealLabel?: string
  baseLabel?: string
  minHeight?: string
}>(), {
  modelValue: 40,
  revealLabel: 'Photos',
  baseLabel: 'Line items',
  minHeight: '440px',
})

const emit = defineEmits<{
  'update:modelValue': [value: number]
}>()

const rootRef = ref<HTMLElement | null>(null)
const dragging = ref(false)

const percent = computed({
  get: () => Math.min(100, Math.max(0, Number(props.modelValue) || 0)),
  set: (value: number) => emit('update:modelValue', Math.min(100, Math.max(0, value))),
})

const rootWidth = ref(0)

function measure() {
  rootWidth.value = rootRef.value?.getBoundingClientRect().width ?? 0
}

function setFromClientX(clientX: number) {
  const el = rootRef.value
  if (!el) return
  const rect = el.getBoundingClientRect()
  if (rect.width <= 0) return
  percent.value = ((clientX - rect.left) / rect.width) * 100
}

function onHandlePointerDown(event: PointerEvent) {
  const target = event.currentTarget as HTMLElement
  target.setPointerCapture(event.pointerId)
  dragging.value = true
  measure()
  setFromClientX(event.clientX)
  event.preventDefault()
}

function onHandlePointerMove(event: PointerEvent) {
  if (!dragging.value) return
  setFromClientX(event.clientX)
}

function onHandlePointerUp(event: PointerEvent) {
  if (!dragging.value) return
  dragging.value = false
  try {
    (event.currentTarget as HTMLElement).releasePointerCapture(event.pointerId)
  }
  catch {
    // already released
  }
}

function snap(value: number) {
  percent.value = value
}

function onKeydown(event: KeyboardEvent) {
  const step = event.shiftKey ? 10 : 4
  if (event.key === 'ArrowLeft') {
    event.preventDefault()
    percent.value = percent.value - step
  }
  else if (event.key === 'ArrowRight') {
    event.preventDefault()
    percent.value = percent.value + step
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
    <div class="reveal-slider__toolbar">
      <button
        type="button"
        class="reveal-slider__chip"
        :class="{ on: percent >= 85 }"
        @click="snap(100)"
      >
        {{ revealLabel }}
      </button>
      <button
        type="button"
        class="reveal-slider__chip"
        :class="{ on: percent > 20 && percent < 80 }"
        @click="snap(45)"
      >
        Split
      </button>
      <button
        type="button"
        class="reveal-slider__chip"
        :class="{ on: percent <= 15 }"
        @click="snap(0)"
      >
        {{ baseLabel }}
      </button>
      <span class="reveal-slider__hint">Drag the bar to compare</span>
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
        class="reveal-slider__handle"
        role="slider"
        tabindex="0"
        :aria-valuemin="0"
        :aria-valuemax="100"
        :aria-valuenow="Math.round(percent)"
        :aria-label="`Reveal ${revealLabel} over ${baseLabel}`"
        :style="{ left: `${percent}%` }"
        @pointerdown="onHandlePointerDown"
        @pointermove="onHandlePointerMove"
        @pointerup="onHandlePointerUp"
        @pointercancel="onHandlePointerUp"
        @keydown="onKeydown"
        @dblclick="snap(45)"
      >
        <span class="reveal-slider__grip" aria-hidden="true" />
      </div>
    </div>
  </div>
</template>

<style scoped>
.reveal-slider {
  display: flex;
  flex-direction: column;
  gap: 10px;
  min-width: 0;
}

.reveal-slider__toolbar {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}

.reveal-slider__chip {
  appearance: none;
  border: 1px solid #e2e8f0;
  background: #fff;
  color: #334155;
  border-radius: 8px;
  padding: 6px 12px;
  font: inherit;
  font-size: 12.5px;
  font-weight: 650;
  cursor: pointer;
  min-height: 36px;
}

.reveal-slider__chip:hover {
  border-color: #cbd5e1;
  background: #f8fafc;
}

.reveal-slider__chip.on {
  border-color: #94a3b8;
  background: #f1f5f9;
  color: #0f172a;
}

.reveal-slider__hint {
  margin-left: auto;
  font-size: 11.5px;
  color: #94a3b8;
}

.reveal-slider__stage {
  position: relative;
  flex: 1 1 auto;
  min-height: inherit;
  border: 1px solid #e2e8f0;
  border-radius: 12px;
  overflow: hidden;
  background: #fff;
  touch-action: none;
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
  border-right: 1px solid rgba(15, 23, 42, 0.12);
  background: #fff;
  pointer-events: auto;
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

.reveal-slider__handle {
  position: absolute;
  top: 0;
  bottom: 0;
  width: 28px;
  margin-left: -14px;
  z-index: 4;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: col-resize;
  touch-action: none;
  outline: none;
}

.reveal-slider__handle:focus-visible .reveal-slider__grip {
  box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.35);
}

.reveal-slider__grip {
  width: 4px;
  height: min(48%, 120px);
  border-radius: 999px;
  background: #64748b;
  box-shadow: 0 0 0 3px #fff, 0 2px 8px rgba(15, 23, 42, 0.2);
}

.reveal-slider__handle::before {
  content: '';
  position: absolute;
  inset: 0;
  background: transparent;
}

.reveal-slider--dragging {
  user-select: none;
}

.reveal-slider--dragging .reveal-slider__panel-body {
  pointer-events: none;
}

@media (max-width: 720px) {
  .reveal-slider__hint {
    display: none;
  }

  .reveal-slider__stage {
    min-height: 360px;
  }
}
</style>
