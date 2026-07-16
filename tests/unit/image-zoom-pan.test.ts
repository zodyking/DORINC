import { describe, expect, it } from 'vitest'
import { ref } from 'vue'
import { computeImageFitScale, useImageZoomPan } from '../../app/composables/useImageZoomPan'

describe('useImageZoomPan', () => {
  it('resets pan and scale to the fit baseline (100%)', () => {
    const container = ref<HTMLElement | null>(null)
    const zoom = useImageZoomPan(container)
    zoom.zoomIn()
    zoom.zoomIn()
    expect(zoom.scale.value).toBeGreaterThan(1)
    zoom.resetView()
    expect(zoom.scale.value).toBe(1)
    expect(zoom.zoomPercent.value).toBe(100)
  })

  it('does not zoom out below the fit baseline', () => {
    const container = ref<HTMLElement | null>(null)
    const zoom = useImageZoomPan(container)
    for (let i = 0; i < 20; i++) zoom.zoomOut()
    expect(zoom.scale.value).toBe(1)
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
