import { computed, ref, type Ref } from 'vue'

const MIN_SCALE = 0.25
const MAX_SCALE = 6

interface DragStart {
  x: number
  y: number
  panX: number
  panY: number
}

/** Client-side pan + zoom for an image inside a container (wheel, drag, pinch). */
export function useImageZoomPan(containerRef: Ref<HTMLElement | null>) {
  const scale = ref(1)
  const panX = ref(0)
  const panY = ref(0)
  const dragging = ref(false)

  const zoomPercent = computed(() => Math.round(scale.value * 100))
  const canPan = computed(() => scale.value > 1 || Math.abs(panX.value) > 1 || Math.abs(panY.value) > 1)

  const transformStyle = computed(() => ({
    transform: `translate3d(${panX.value}px, ${panY.value}px, 0) scale(${scale.value})`,
  }))

  let dragStart: DragStart | null = null
  const activePointers = new Map<number, { x: number, y: number }>()
  let pinchStartDistance = 0
  let pinchStartScale = 1

  function clampScale(value: number) {
    return Math.min(MAX_SCALE, Math.max(MIN_SCALE, value))
  }

  function resetView() {
    scale.value = 1
    panX.value = 0
    panY.value = 0
    dragging.value = false
    dragStart = null
    activePointers.clear()
    pinchStartDistance = 0
  }

  function zoomAt(factor: number, clientX?: number, clientY?: number) {
    const el = containerRef.value
    const prev = scale.value
    const next = clampScale(prev * factor)
    if (next === prev) return

    if (el && clientX != null && clientY != null) {
      const rect = el.getBoundingClientRect()
      const originX = clientX - rect.left - rect.width / 2
      const originY = clientY - rect.top - rect.height / 2
      const ratio = next / prev
      panX.value = originX - (originX - panX.value) * ratio
      panY.value = originY - (originY - panY.value) * ratio
    }

    scale.value = next
  }

  function zoomIn() {
    zoomAt(1.25)
  }

  function zoomOut() {
    zoomAt(1 / 1.25)
  }

  function onWheel(event: WheelEvent) {
    event.preventDefault()
    const factor = event.deltaY < 0 ? 1.12 : 1 / 1.12
    zoomAt(factor, event.clientX, event.clientY)
  }

  function pointerDistance(
    a: { x: number, y: number },
    b: { x: number, y: number },
  ) {
    return Math.hypot(a.x - b.x, a.y - b.y)
  }

  function onPointerDown(event: PointerEvent) {
    const target = event.currentTarget as HTMLElement
    target.setPointerCapture(event.pointerId)
    activePointers.set(event.pointerId, { x: event.clientX, y: event.clientY })

    if (activePointers.size === 1) {
      dragging.value = true
      dragStart = {
        x: event.clientX,
        y: event.clientY,
        panX: panX.value,
        panY: panY.value,
      }
    }
    else if (activePointers.size === 2) {
      dragging.value = false
      dragStart = null
      const pts = [...activePointers.values()]
      pinchStartDistance = pointerDistance(pts[0]!, pts[1]!)
      pinchStartScale = scale.value
    }
  }

  function onPointerMove(event: PointerEvent) {
    if (!activePointers.has(event.pointerId)) return
    activePointers.set(event.pointerId, { x: event.clientX, y: event.clientY })

    if (activePointers.size >= 2) {
      const pts = [...activePointers.values()]
      const distance = pointerDistance(pts[0]!, pts[1]!)
      if (pinchStartDistance > 0) {
        scale.value = clampScale(pinchStartScale * (distance / pinchStartDistance))
      }
      return
    }

    if (!dragging.value || !dragStart) return
    panX.value = dragStart.panX + (event.clientX - dragStart.x)
    panY.value = dragStart.panY + (event.clientY - dragStart.y)
  }

  function onPointerUp(event: PointerEvent) {
    const target = event.currentTarget as HTMLElement
    try {
      target.releasePointerCapture(event.pointerId)
    }
    catch {
      // Pointer may already be released.
    }
    activePointers.delete(event.pointerId)

    if (activePointers.size < 2) {
      pinchStartDistance = 0
      pinchStartScale = scale.value
    }

    if (activePointers.size === 0) {
      dragging.value = false
      dragStart = null
    }
    else if (activePointers.size === 1) {
      const remaining = [...activePointers.values()][0]!
      dragging.value = true
      dragStart = {
        x: remaining.x,
        y: remaining.y,
        panX: panX.value,
        panY: panY.value,
      }
    }
  }

  return {
    scale,
    zoomPercent,
    canPan,
    dragging,
    transformStyle,
    resetView,
    zoomIn,
    zoomOut,
    onWheel,
    onPointerDown,
    onPointerMove,
    onPointerUp,
  }
}
