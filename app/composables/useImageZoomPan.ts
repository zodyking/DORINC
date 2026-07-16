import { computed, onScopeDispose, ref, type Ref } from 'vue'

const MIN_SCALE = 0.25
const MAX_SCALE = 6

export function computeImageFitScale(
  containerWidth: number,
  containerHeight: number,
  paddingX: number,
  paddingY: number,
  naturalWidth: number,
  naturalHeight: number,
) {
  const availW = Math.max(containerWidth - paddingX, 1)
  const availH = Math.max(containerHeight - paddingY, 1)
  if (!naturalWidth || !naturalHeight) return 1

  const scaleW = availW / naturalWidth
  const scaleH = availH / naturalHeight
  return Math.min(MAX_SCALE, Math.max(MIN_SCALE, Math.min(scaleW, scaleH)))
}

interface DragStart {
  x: number
  y: number
  panX: number
  panY: number
}

/** Client-side pan + zoom for an image inside a container (wheel, drag, pinch). */
export function useImageZoomPan(containerRef: Ref<HTMLElement | null>) {
  const scale = ref(1)
  const fitScale = ref(1)
  const panX = ref(0)
  const panY = ref(0)
  const dragging = ref(false)

  const zoomPercent = computed(() => Math.round((scale.value / fitScale.value) * 100))
  const canPan = computed(() => scale.value > fitScale.value || Math.abs(panX.value) > 1 || Math.abs(panY.value) > 1)

  const transformStyle = computed(() => ({
    transform: `translate3d(${panX.value}px, ${panY.value}px, 0) scale(${scale.value})`,
  }))

  let dragStart: DragStart | null = null
  const activePointers = new Map<number, { x: number, y: number }>()
  let pinchStartDistance = 0
  let pinchStartScale = 1
  let resizeObserver: ResizeObserver | null = null
  let observedImage: HTMLImageElement | null = null

  function clampScale(value: number) {
    return Math.min(MAX_SCALE, Math.max(MIN_SCALE, value))
  }

  function resetView() {
    scale.value = fitScale.value
    panX.value = 0
    panY.value = 0
    dragging.value = false
    dragStart = null
    activePointers.clear()
    pinchStartDistance = 0
  }

  function computeFitScale(imageEl: HTMLImageElement, container: HTMLElement) {
    const styles = getComputedStyle(container)
    const padX = Number.parseFloat(styles.paddingLeft) + Number.parseFloat(styles.paddingRight)
    const padY = Number.parseFloat(styles.paddingTop) + Number.parseFloat(styles.paddingBottom)
    return computeImageFitScale(
      container.clientWidth,
      container.clientHeight,
      padX,
      padY,
      imageEl.naturalWidth,
      imageEl.naturalHeight,
    )
  }

  function fitToContainer(imageEl: HTMLImageElement | null) {
    const container = containerRef.value
    if (!container || !imageEl?.naturalWidth || !imageEl.naturalHeight) return

    observedImage = imageEl
    const nextFit = computeFitScale(imageEl, container)
    const wasAtFit = Math.abs(scale.value - fitScale.value) < 0.01 && Math.abs(panX.value) < 1 && Math.abs(panY.value) < 1

    fitScale.value = nextFit
    if (wasAtFit) {
      scale.value = nextFit
      panX.value = 0
      panY.value = 0
    }
  }

  function observeContainer() {
    const container = containerRef.value
    if (!container || typeof ResizeObserver === 'undefined') return

    resizeObserver?.disconnect()
    resizeObserver = new ResizeObserver(() => {
      if (observedImage) fitToContainer(observedImage)
    })
    resizeObserver.observe(container)
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

  onScopeDispose(() => {
    resizeObserver?.disconnect()
    resizeObserver = null
    observedImage = null
  })

  return {
    scale,
    fitScale,
    zoomPercent,
    canPan,
    dragging,
    transformStyle,
    resetView,
    fitToContainer,
    observeContainer,
    zoomIn,
    zoomOut,
    onWheel,
    onPointerDown,
    onPointerMove,
    onPointerUp,
  }
}
