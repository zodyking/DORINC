import { describe, expect, it } from 'vitest'
import {
  analyzeDocumentImageData,
  approxPolyDP,
  createImageData,
  drawFilledRect,
  laplacianVariance,
} from '../../shared/document-scan-quality'

function grayImage(width: number, height: number, value: number) {
  return createImageData(width, height, [value, value, value, 255])
}

describe('document scan quality', () => {
  it('scores sharp high-contrast edges higher than a blurred flat field', () => {
    const sharp = createImageData(120, 160, [30, 30, 30, 255])
    // Checkerboard = lots of edges
    for (let y = 0; y < 160; y += 1) {
      for (let x = 0; x < 120; x += 1) {
        const on = ((x >> 2) + (y >> 2)) % 2 === 0
        const v = on ? 240 : 20
        const i = (y * 120 + x) * 4
        sharp.data[i] = v
        sharp.data[i + 1] = v
        sharp.data[i + 2] = v
      }
    }
    const flat = grayImage(120, 160, 128)

    const sharpGray = new Float32Array(120 * 160)
    const flatGray = new Float32Array(120 * 160)
    for (let i = 0, j = 0; i < sharp.data.length; i += 4, j += 1) {
      sharpGray[j] = sharp.data[i]!
      flatGray[j] = flat.data[i]!
    }

    expect(laplacianVariance(sharpGray, 120, 160)).toBeGreaterThan(
      laplacianVariance(flatGray, 120, 160) + 40,
    )
  })

  it('detects a bright page on a dark background with acceptable quality', () => {
    const frame = createImageData(240, 320, [24, 24, 24, 255])
    drawFilledRect(frame, 40, 36, 200, 286, [245, 245, 240])
    // Add print-like texture so blur/contrast checks pass.
    for (let y = 50; y < 270; y += 3) {
      for (let x = 55; x < 185; x += 7) {
        const i = (y * 240 + x) * 4
        frame.data[i] = 20
        frame.data[i + 1] = 20
        frame.data[i + 2] = 20
      }
    }

    const result = analyzeDocumentImageData(frame)
    expect(result.documentFound).toBe(true)
    expect(result.quad).not.toBeNull()
    expect(result.coverage).toBeGreaterThan(0.2)
    expect(result.blurOk).toBe(true)
    expect(result.ok).toBe(true)
    expect(result.normalizedQuad).not.toBeNull()
  })

  it('rejects empty / no-document frames', () => {
    const empty = grayImage(200, 260, 90)
    const result = analyzeDocumentImageData(empty)
    expect(result.documentFound).toBe(false)
    expect(result.ok).toBe(false)
    expect(result.issues.join(' ')).toMatch(/borders|page/i)
  })

  it('flags low-light frames', () => {
    const dark = createImageData(200, 260, [8, 8, 8, 255])
    drawFilledRect(dark, 30, 30, 170, 230, [18, 18, 18])
    const result = analyzeDocumentImageData(dark, { minBrightness: 40 })
    expect(result.brightnessOk).toBe(false)
    expect(result.issues.join(' ')).toMatch(/dark|light|flash/i)
  })

  it('simplifies polylines with approxPolyDP', () => {
    const jagged = [
      { x: 0, y: 0 },
      { x: 10, y: 0.2 },
      { x: 20, y: 0 },
      { x: 20.2, y: 10 },
      { x: 20, y: 20 },
      { x: 10, y: 19.8 },
      { x: 0, y: 20 },
      { x: -0.2, y: 10 },
    ]
    const approx = approxPolyDP(jagged, 1.5)
    expect(approx.length).toBeLessThan(jagged.length)
    expect(approx.length).toBeGreaterThanOrEqual(4)
  })
})
