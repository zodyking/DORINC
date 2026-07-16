import { describe, expect, it } from 'vitest'
import { ref } from 'vue'
import { computeImageFitScale, useImageZoomPan } from '../../app/composables/useImageZoomPan'

describe('useImageZoomPan', () => {
  it('resets pan and scale to the fit baseline', () => {
    const container = ref<HTMLElement | null>(null)
    const zoom = useImageZoomPan(container)
    zoom.zoomIn()
    zoom.zoomIn()
    expect(zoom.scale.value).toBeGreaterThan(zoom.fitScale.value)
    zoom.resetView()
    expect(zoom.scale.value).toBe(zoom.fitScale.value)
    expect(zoom.zoomPercent.value).toBe(100)
  })

  it('clamps zoom out to the minimum scale', () => {
    const container = ref<HTMLElement | null>(null)
    const zoom = useImageZoomPan(container)
    for (let i = 0; i < 20; i++) zoom.zoomOut()
    expect(zoom.scale.value).toBeGreaterThanOrEqual(0.25)
  })

  it('computes a fit scale that fills the available stage area', () => {
    const fit = computeImageFitScale(400, 300, 32, 32, 800, 600)
    expect(fit).toBeLessThan(1)
    expect(fit).toBeCloseTo(268 / 600, 5)
  })

  it('upscales small images to use the stage width', () => {
    const fit = computeImageFitScale(400, 300, 32, 32, 200, 150)
    expect(fit).toBeGreaterThan(1)
    expect(fit).toBeCloseTo(268 / 150, 5)
  })
})
