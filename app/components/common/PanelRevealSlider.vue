<script setup lang="ts">
/**
 * Resizable split view for two panels (e.g. Service Log photos vs line items).
 * Desktop: true side-by-side columns with a draggable divider — each panel is
 * laid out at its real column width, never clipped under the other (the old
 * curtain reveal rendered the photo panel full-width and cropped it, which
 * looked "zoomed in" and made both halves unusable).
 * Mobile: full-width tabs — split columns are too cramped under ~720px.
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
/** Keep both panels usable while split — never a sliver. */
const MIN_SPLIT = 22
const MAX_SPLIT = 78

const stageRef = ref<HTMLElement | null>(null)
const dragging = ref(false)

const percent = computed({
  get: () => Math.min(100, Math.max(0, Number(props.modelValue) || 0)),
  set: (value: number) => emit('update:modelValue', Math.min(100, Math.max(0, value))),
})

const showReveal = computed(() => percent.value > 0)
const showBase = computed(() => percent.value < 100)
const isSplit = computed(() => showReveal.value && showBase.value)

/** Column width while split, clamped so neither side collapses mid-drag. */
const splitPercent = computed(() => Math.min(MAX_SPLIT, Math.max(MIN_SPLIT, percent.value)))

type ViewMode = 'reveal' | 'split' | 'base'
const viewMode = computed<ViewMode>(() => {
  if (!showBase.value) return 'reveal'
  if (!showReveal.value) return 'base'
  return 'split'
})

function setMode(mode: ViewMode) {
  if (mode === 'reveal') percent.value = 100
  else if (mode === 'base') percent.value = 0
  else percent.value = 50
}

/* Narrow screens: tabs instead of split columns. */
const isNarrow = ref(false)
let mq: MediaQueryList | null = null
const onMqChange = () => { isNarrow.value = mq?.matches ?? false }

const mobileTab = computed<'reveal' | 'base'>(() => (percent.value >= 50 ? 'reveal' : 'base'))
function setMobileTab(tab: 'reveal' | 'base') {
  percent.value = tab === 'reveal' ? 100 : 0
}

function snapEdges(value: number) {
  if (value <= EDGE_SNAP) return 0
  if (value >= 100 - EDGE_SNAP) return 100
  return value
}

function setFromClientX(clientX: number) {
  const rect = stageRef.value?.getBoundingClientRect()
  if (!rect || rect.width <= 0) return
  percent.value = ((clientX - rect.left) / rect.width) * 100
}

function onDividerPointerDown(event: PointerEvent) {
  (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId)
  dragging.value = true
  event.preventDefault()
}

function onDividerPointerMove(event: PointerEvent) {
  if (!dragging.value) return
  setFromClientX(event.clientX)
}

function onDividerPointerUp(event: PointerEvent) {
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

onMounted(() => {
  if (!import.meta.client) return
  mq = window.matchMedia('(max-width: 720px)')
  onMqChange()
  mq.addEventListener('change', onMqChange)
})

onBeforeUnmount(() => {
  mq?.removeEventListener('change', onMqChange)
  mq = null
})
</script>

<template>
  <div
    class="reveal-slider"
    :class="{ 'reveal-slider--dragging': dragging, 'reveal-slider--narrow': isNarrow }"
    :style="{ minHeight }"
  >
    <!-- Mobile: full-width tabs -->
    <div v-if="isNarrow" class="reveal-slider__tabs" role="tablist">
      <button
        type="button"
        role="tab"
        class="reveal-slider__tab"
        :class="{ on: mobileTab === 'reveal' }"
        :aria-selected="mobileTab === 'reveal'"
        @click="setMobileTab('reveal')"
      >
        {{ revealLabel }}
      </button>
      <button
        type="button"
        role="tab"
        class="reveal-slider__tab"
        :class="{ on: mobileTab === 'base' }"
        :aria-selected="mobileTab === 'base'"
        @click="setMobileTab('base')"
      >
        {{ baseLabel }}
      </button>
    </div>

    <!-- Desktop: view snaps -->
    <div v-else class="reveal-slider__control">
      <div class="reveal-slider__modes" role="group" aria-label="Panel layout">
        <button
          type="button"
          class="reveal-slider__mode"
          :class="{ on: viewMode === 'reveal' }"
          @click="setMode('reveal')"
        >
          {{ revealLabel }}
        </button>
        <button
          type="button"
          class="reveal-slider__mode"
          :class="{ on: viewMode === 'split' }"
          @click="setMode('split')"
        >
          Split
        </button>
        <button
          type="button"
          class="reveal-slider__mode"
          :class="{ on: viewMode === 'base' }"
          @click="setMode('base')"
        >
          {{ baseLabel }}
        </button>
      </div>
      <span class="reveal-slider__hint">Drag the divider to resize</span>
    </div>

    <div ref="stageRef" class="reveal-slider__stage">
      <div
        v-if="showReveal && (!isNarrow || mobileTab === 'reveal')"
        class="reveal-slider__panel reveal-slider__panel--reveal"
        :style="!isNarrow && isSplit ? { width: `${splitPercent}%` } : undefined"
      >
        <div class="reveal-slider__panel-body">
          <slot name="reveal" />
        </div>
      </div>

      <div
        v-if="!isNarrow && isSplit"
        class="reveal-slider__divider"
        role="slider"
        tabindex="0"
        :aria-valuemin="0"
        :aria-valuemax="100"
        :aria-valuenow="Math.round(percent)"
        :aria-label="`Resize ${revealLabel} and ${baseLabel}`"
        @pointerdown="onDividerPointerDown"
        @pointermove="onDividerPointerMove"
        @pointerup="onDividerPointerUp"
        @pointercancel="onDividerPointerUp"
        @keydown="onKeydown"
        @dblclick="percent = 50"
      >
        <span class="reveal-slider__grip" aria-hidden="true" />
      </div>

      <div
        v-if="showBase && (!isNarrow || mobileTab === 'base')"
        class="reveal-slider__panel reveal-slider__panel--base"
      >
        <div class="reveal-slider__panel-body">
          <slot name="base" />
        </div>
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

/* ---------- desktop control ---------- */
.reveal-slider__control {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  flex-wrap: wrap;
}

.reveal-slider__modes {
  display: inline-flex;
  border: 1px solid #d1d5db;
  border-radius: 999px;
  overflow: hidden;
  background: #f8fafc;
}

.reveal-slider__mode {
  border: 0;
  background: transparent;
  padding: 7px 16px;
  font: inherit;
  font-size: 13px;
  font-weight: 600;
  color: #64748b;
  cursor: pointer;
  min-height: 34px;
  white-space: nowrap;
}

.reveal-slider__mode:hover:not(.on) {
  color: #0f172a;
}

.reveal-slider__mode.on {
  background: #0f172a;
  color: #fff;
}

.reveal-slider__hint {
  font-size: 12px;
  color: #94a3b8;
}

/* ---------- mobile tabs ---------- */
.reveal-slider__tabs {
  display: grid;
  grid-template-columns: 1fr 1fr;
  border: 1px solid #d1d5db;
  border-radius: 10px;
  overflow: hidden;
  background: #f8fafc;
}

.reveal-slider__tab {
  border: 0;
  background: transparent;
  padding: 10px 12px;
  font: inherit;
  font-size: 13.5px;
  font-weight: 700;
  color: #64748b;
  cursor: pointer;
  min-height: 44px;
}

.reveal-slider__tab.on {
  background: #0f172a;
  color: #fff;
}

/* ---------- stage ---------- */
.reveal-slider__stage {
  position: relative;
  display: flex;
  align-items: stretch;
  flex: 1 1 auto;
  min-height: inherit;
  min-width: 0;
  border: 1px solid #e2e8f0;
  border-radius: 12px;
  overflow: hidden;
  background: #fff;
}

.reveal-slider__panel {
  display: flex;
  flex-direction: column;
  min-width: 0;
  min-height: inherit;
  background: #fff;
}

.reveal-slider__panel--reveal {
  flex: none;
  width: 100%;
}

.reveal-slider__panel--base {
  flex: 1 1 0;
}

.reveal-slider__panel-body {
  flex: 1 1 auto;
  min-height: 0;
  overflow: auto;
  padding: 12px;
}

/* ---------- divider ---------- */
.reveal-slider__divider {
  flex: none;
  width: 14px;
  margin: 0 -2px;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: col-resize;
  touch-action: none;
  outline: none;
  z-index: 2;
  background: transparent;
}

.reveal-slider__divider::before {
  content: '';
  position: absolute;
  top: 0;
  bottom: 0;
  width: 2px;
  background: #e2e8f0;
  transition: background 0.15s ease;
}

.reveal-slider__grip {
  position: relative;
  width: 18px;
  height: 44px;
  border-radius: 999px;
  background: #fff;
  border: 1.5px solid #cbd5e1;
  box-shadow: 0 2px 8px rgba(15, 23, 42, 0.14);
  display: grid;
  place-items: center;
}

.reveal-slider__grip::before {
  content: '';
  width: 4px;
  height: 22px;
  border-radius: 2px;
  background:
    repeating-linear-gradient(
      to bottom,
      #94a3b8 0 3px,
      transparent 3px 6px
    );
}

.reveal-slider__divider:hover::before,
.reveal-slider--dragging .reveal-slider__divider::before {
  background: #6366f1;
}

.reveal-slider__divider:hover .reveal-slider__grip,
.reveal-slider--dragging .reveal-slider__grip {
  border-color: #6366f1;
}

.reveal-slider__divider:focus-visible .reveal-slider__grip {
  box-shadow: 0 0 0 3px rgba(99, 102, 241, 0.35), 0 2px 8px rgba(15, 23, 42, 0.2);
}

.reveal-slider--dragging {
  user-select: none;
}

.reveal-slider--dragging .reveal-slider__panel-body {
  pointer-events: none;
}

@media (max-width: 720px) {
  .reveal-slider__stage {
    min-height: 340px;
  }

  .reveal-slider__panel-body {
    padding: 10px;
  }
}
</style>
