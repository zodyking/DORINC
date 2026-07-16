import { describe, expect, it } from 'vitest'
import { ref } from 'vue'
import { useImageZoomPan } from '../../app/composables/useImageZoomPan'

describe('useImageZoomPan', () => {
  it('resets pan and scale', () => {
    const container = ref<HTMLElement | null>(null)
    const zoom = useImageZoomPan(container)
    zoom.zoomIn()
    zoom.zoomIn()
    expect(zoom.scale.value).toBeGreaterThan(1)
    zoom.resetView()
    expect(zoom.scale.value).toBe(1)
    expect(zoom.zoomPercent.value).toBe(100)
  })

  it('clamps zoom out to the minimum scale', () => {
    const container = ref<HTMLElement | null>(null)
    const zoom = useImageZoomPan(container)
    for (let i = 0; i < 20; i++) zoom.zoomOut()
    expect(zoom.scale.value).toBeGreaterThanOrEqual(0.25)
  })
})
