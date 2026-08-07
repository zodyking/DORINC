/**
 * Client-side document scan quality checks (borders, blur, light, coverage).
 * Pure ImageData algorithms — no OpenCV dependency.
 */

export interface Point2D {
  x: number
  y: number
}

export type DocumentQuad = [Point2D, Point2D, Point2D, Point2D]

export interface DocumentQualityThresholds {
  /** Minimum Laplacian variance (higher = sharper). Tuned for ~320px analysis width. */
  minBlurVariance: number
  /** Document must fill at least this fraction of the frame. */
  minCoverage: number
  /** Document must not exceed this fraction (too close / cropped). */
  maxCoverage: number
  /** Mean luma lower bound (0–255). */
  minBrightness: number
  /** Mean luma upper bound (0–255). */
  maxBrightness: number
  /** Minimum grayscale std-dev (flat/low-contrast frames fail). */
  minContrast: number
}

export interface DocumentQualityResult {
  ok: boolean
  blurScore: number
  blurOk: boolean
  documentFound: boolean
  coverage: number
  coverageOk: boolean
  brightness: number
  brightnessOk: boolean
  contrast: number
  contrastOk: boolean
  quad: DocumentQuad | null
  /** Normalized 0–1 quad in source image space (for overlays). */
  normalizedQuad: DocumentQuad | null
  issues: string[]
  message: string
  analysisWidth: number
  analysisHeight: number
}

export const DEFAULT_DOCUMENT_QUALITY_THRESHOLDS: DocumentQualityThresholds = {
  minBlurVariance: 55,
  minCoverage: 0.22,
  maxCoverage: 0.92,
  minBrightness: 40,
  maxBrightness: 230,
  minContrast: 18,
}

const ANALYSIS_MAX_WIDTH = 320

export function createImageData(width: number, height: number, fill: [number, number, number, number] = [0, 0, 0, 255]): ImageData {
  const data = new Uint8ClampedArray(width * height * 4)
  for (let i = 0; i < data.length; i += 4) {
    data[i] = fill[0]
    data[i + 1] = fill[1]
    data[i + 2] = fill[2]
    data[i + 3] = fill[3]
  }
  return { data, width, height, colorSpace: 'srgb' } as ImageData
}

export function drawFilledRect(
  image: ImageData,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  rgb: [number, number, number],
) {
  const left = Math.max(0, Math.min(x0, x1))
  const right = Math.min(image.width - 1, Math.max(x0, x1))
  const top = Math.max(0, Math.min(y0, y1))
  const bottom = Math.min(image.height - 1, Math.max(y0, y1))
  for (let y = top; y <= bottom; y += 1) {
    for (let x = left; x <= right; x += 1) {
      const i = (y * image.width + x) * 4
      image.data[i] = rgb[0]
      image.data[i + 1] = rgb[1]
      image.data[i + 2] = rgb[2]
      image.data[i + 3] = 255
    }
  }
}

function toGray(image: ImageData): Float32Array {
  const gray = new Float32Array(image.width * image.height)
  const { data } = image
  for (let i = 0, j = 0; i < data.length; i += 4, j += 1) {
    gray[j] = 0.299 * data[i]! + 0.587 * data[i + 1]! + 0.114 * data[i + 2]!
  }
  return gray
}

function meanStd(values: Float32Array): { mean: number, std: number } {
  let sum = 0
  for (let i = 0; i < values.length; i += 1) sum += values[i]!
  const mean = sum / Math.max(1, values.length)
  let sq = 0
  for (let i = 0; i < values.length; i += 1) {
    const d = values[i]! - mean
    sq += d * d
  }
  return { mean, std: Math.sqrt(sq / Math.max(1, values.length)) }
}

export function laplacianVariance(gray: Float32Array, width: number, height: number): number {
  let sum = 0
  let sumSq = 0
  let count = 0
  for (let y = 1; y < height - 1; y += 1) {
    for (let x = 1; x < width - 1; x += 1) {
      const i = y * width + x
      const lap = (
        4 * gray[i]!
        - gray[i - 1]!
        - gray[i + 1]!
        - gray[i - width]!
        - gray[i + width]!
      )
      sum += lap
      sumSq += lap * lap
      count += 1
    }
  }
  if (!count) return 0
  const mean = sum / count
  return Math.max(0, (sumSq / count) - (mean * mean))
}

function boxBlurGray(gray: Float32Array, width: number, height: number, radius = 1): Float32Array {
  const out = new Float32Array(gray.length)
  const tmp = new Float32Array(gray.length)
  const diam = radius * 2 + 1

  for (let y = 0; y < height; y += 1) {
    let sum = 0
    for (let x = -radius; x <= radius; x += 1) {
      const xx = Math.min(width - 1, Math.max(0, x))
      sum += gray[y * width + xx]!
    }
    for (let x = 0; x < width; x += 1) {
      tmp[y * width + x] = sum / diam
      const remove = Math.min(width - 1, Math.max(0, x - radius))
      const add = Math.min(width - 1, Math.max(0, x + radius + 1))
      sum += gray[y * width + add]! - gray[y * width + remove]!
    }
  }

  for (let x = 0; x < width; x += 1) {
    let sum = 0
    for (let y = -radius; y <= radius; y += 1) {
      const yy = Math.min(height - 1, Math.max(0, y))
      sum += tmp[yy * width + x]!
    }
    for (let y = 0; y < height; y += 1) {
      out[y * width + x] = sum / diam
      const remove = Math.min(height - 1, Math.max(0, y - radius))
      const add = Math.min(height - 1, Math.max(0, y + radius + 1))
      sum += tmp[add * width + x]! - tmp[remove * width + x]!
    }
  }
  return out
}

function sobelMagnitude(gray: Float32Array, width: number, height: number): Float32Array {
  const mag = new Float32Array(width * height)
  for (let y = 1; y < height - 1; y += 1) {
    for (let x = 1; x < width - 1; x += 1) {
      const i = y * width + x
      const gx = (
        -gray[i - width - 1]! + gray[i - width + 1]!
        - 2 * gray[i - 1]! + 2 * gray[i + 1]!
        - gray[i + width - 1]! + gray[i + width + 1]!
      )
      const gy = (
        -gray[i - width - 1]! - 2 * gray[i - width]! - gray[i - width + 1]!
        + gray[i + width - 1]! + 2 * gray[i + width]! + gray[i + width + 1]!
      )
      mag[i] = Math.hypot(gx, gy)
    }
  }
  return mag
}

function percentile(values: Float32Array, p: number): number {
  const sample: number[] = []
  const step = Math.max(1, Math.floor(values.length / 4000))
  for (let i = 0; i < values.length; i += step) sample.push(values[i]!)
  sample.sort((a, b) => a - b)
  const idx = Math.min(sample.length - 1, Math.max(0, Math.floor((sample.length - 1) * p)))
  return sample[idx] ?? 0
}

function findLargestContour(binary: Uint8Array, width: number, height: number): Point2D[] | null {
  const visited = new Uint8Array(binary.length)
  let best: Point2D[] | null = null
  let bestArea = 0

  const dirs: Array<[number, number]> = [
    [1, 0], [1, 1], [0, 1], [-1, 1],
    [-1, 0], [-1, -1], [0, -1], [1, -1],
  ]

  for (let y = 1; y < height - 1; y += 1) {
    for (let x = 1; x < width - 1; x += 1) {
      const start = y * width + x
      if (!binary[start] || visited[start]) continue

      // Flood fill component to measure area + collect border-ish points.
      const stack = [start]
      visited[start] = 1
      let area = 0
      let minX = x
      let maxX = x
      let minY = y
      let maxY = y
      const edgePts: Point2D[] = []

      while (stack.length) {
        const i = stack.pop()!
        area += 1
        const cx = i % width
        const cy = (i / width) | 0
        if (cx < minX) minX = cx
        if (cx > maxX) maxX = cx
        if (cy < minY) minY = cy
        if (cy > maxY) maxY = cy

        let isEdge = false
        for (const [dx, dy] of dirs) {
          const nx = cx + dx
          const ny = cy + dy
          if (nx < 0 || ny < 0 || nx >= width || ny >= height) {
            isEdge = true
            continue
          }
          const ni = ny * width + nx
          if (!binary[ni]) {
            isEdge = true
            continue
          }
          if (!visited[ni]) {
            visited[ni] = 1
            stack.push(ni)
          }
        }
        if (isEdge) edgePts.push({ x: cx, y: cy })
      }

      const bboxArea = (maxX - minX + 1) * (maxY - minY + 1)
      if (area < width * height * 0.03 || bboxArea <= bestArea) continue
      if (edgePts.length < 20) continue

      // Sample perimeter points for approximation (convex-ish hull via extremes + edges).
      const hull = convexHull(edgePts)
      if (hull.length < 4) continue
      bestArea = bboxArea
      best = hull
    }
  }

  return best
}

function cross(o: Point2D, a: Point2D, b: Point2D): number {
  return (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x)
}

function convexHull(points: Point2D[]): Point2D[] {
  const pts = [...points].sort((a, b) => (a.x - b.x) || (a.y - b.y))
  if (pts.length <= 1) return pts
  const lower: Point2D[] = []
  for (const p of pts) {
    while (lower.length >= 2 && cross(lower[lower.length - 2]!, lower[lower.length - 1]!, p) <= 0) lower.pop()
    lower.push(p)
  }
  const upper: Point2D[] = []
  for (let i = pts.length - 1; i >= 0; i -= 1) {
    const p = pts[i]!
    while (upper.length >= 2 && cross(upper[upper.length - 2]!, upper[upper.length - 1]!, p) <= 0) upper.pop()
    upper.push(p)
  }
  lower.pop()
  upper.pop()
  return lower.concat(upper)
}

function dist(a: Point2D, b: Point2D): number {
  return Math.hypot(a.x - b.x, a.y - b.y)
}

/** Douglas–Peucker polyline simplification. */
export function approxPolyDP(points: Point2D[], epsilon: number): Point2D[] {
  if (points.length < 3) return [...points]
  let maxDist = 0
  let index = 0
  const end = points.length - 1
  const start = points[0]!
  const last = points[end]!
  for (let i = 1; i < end; i += 1) {
    const d = perpendicularDistance(points[i]!, start, last)
    if (d > maxDist) {
      index = i
      maxDist = d
    }
  }
  if (maxDist > epsilon) {
    const left = approxPolyDP(points.slice(0, index + 1), epsilon)
    const right = approxPolyDP(points.slice(index), epsilon)
    return left.slice(0, -1).concat(right)
  }
  return [start, last]
}

function perpendicularDistance(p: Point2D, a: Point2D, b: Point2D): number {
  const num = Math.abs((b.y - a.y) * p.x - (b.x - a.x) * p.y + b.x * a.y - b.y * a.x)
  const den = dist(a, b) || 1
  return num / den
}

function orderQuad(points: Point2D[]): DocumentQuad {
  const sorted = [...points].sort((a, b) => (a.y - b.y) || (a.x - b.x))
  const top = sorted.slice(0, 2).sort((a, b) => a.x - b.x)
  const bottom = sorted.slice(2, 4).sort((a, b) => a.x - b.x)
  return [top[0]!, top[1]!, bottom[1]!, bottom[0]!]
}

function quadArea(q: DocumentQuad): number {
  // Shoelace
  let area = 0
  for (let i = 0; i < 4; i += 1) {
    const a = q[i]!
    const b = q[(i + 1) % 4]!
    area += a.x * b.y - b.x * a.y
  }
  return Math.abs(area) / 2
}

function angleAt(a: Point2D, b: Point2D, c: Point2D): number {
  const abx = a.x - b.x
  const aby = a.y - b.y
  const cbx = c.x - b.x
  const cby = c.y - b.y
  const dot = abx * cbx + aby * cby
  const den = (Math.hypot(abx, aby) * Math.hypot(cbx, cby)) || 1
  return Math.acos(Math.max(-1, Math.min(1, dot / den)))
}

function scoreQuad(q: DocumentQuad, width: number, height: number): number {
  const area = quadArea(q)
  const coverage = area / (width * height)
  if (coverage < 0.12 || coverage > 0.96) return 0

  let angleScore = 0
  for (let i = 0; i < 4; i += 1) {
    const deg = angleAt(q[(i + 3) % 4]!, q[i]!, q[(i + 1) % 4]!) * (180 / Math.PI)
    angleScore += Math.max(0, 1 - Math.abs(deg - 90) / 55)
  }
  angleScore /= 4

  const w1 = dist(q[0], q[1])
  const w2 = dist(q[3], q[2])
  const h1 = dist(q[0], q[3])
  const h2 = dist(q[1], q[2])
  const avgW = (w1 + w2) / 2
  const avgH = (h1 + h2) / 2
  if (avgW < 8 || avgH < 8) return 0
  const aspect = avgH / avgW
  // Service log sheets are usually portrait-ish; allow landscape phone hold.
  const aspectOk = (aspect > 0.55 && aspect < 1.9) || (1 / aspect > 0.55 && 1 / aspect < 1.9)
  if (!aspectOk) return 0

  return coverage * 0.55 + angleScore * 0.45
}

function findDocumentQuad(gray: Float32Array, width: number, height: number): DocumentQuad | null {
  const blurred = boxBlurGray(gray, width, height, 1)
  const mag = sobelMagnitude(blurred, width, height)
  const thr = Math.max(28, percentile(mag, 0.86))
  const binary = new Uint8Array(width * height)
  for (let i = 0; i < mag.length; i += 1) binary[i] = mag[i]! >= thr ? 1 : 0

  const hull = findLargestContour(binary, width, height)
  if (!hull || hull.length < 4) return null

  const peri = hull.reduce((acc, p, i) => acc + dist(p, hull[(i + 1) % hull.length]!), 0)
  let approx = approxPolyDP(hull, Math.max(3, peri * 0.02))
  // Close ring for DP if needed
  if (approx.length > 2 && dist(approx[0]!, approx[approx.length - 1]!) < 2) {
    approx = approx.slice(0, -1)
  }

  // If not 4 points, try a few epsilons.
  if (approx.length !== 4) {
    for (const factor of [0.015, 0.03, 0.04, 0.055]) {
      let candidate = approxPolyDP(hull, Math.max(2, peri * factor))
      if (candidate.length > 2 && dist(candidate[0]!, candidate[candidate.length - 1]!) < 2) {
        candidate = candidate.slice(0, -1)
      }
      if (candidate.length === 4) {
        approx = candidate
        break
      }
    }
  }

  if (approx.length !== 4) {
    // Fallback: axis-aligned bbox of hull (still a real border estimate).
    let minX = Infinity
    let minY = Infinity
    let maxX = -Infinity
    let maxY = -Infinity
    for (const p of hull) {
      if (p.x < minX) minX = p.x
      if (p.y < minY) minY = p.y
      if (p.x > maxX) maxX = p.x
      if (p.y > maxY) maxY = p.y
    }
    const bbox: DocumentQuad = [
      { x: minX, y: minY },
      { x: maxX, y: minY },
      { x: maxX, y: maxY },
      { x: minX, y: maxY },
    ]
    return scoreQuad(bbox, width, height) > 0.25 ? bbox : null
  }

  const quad = orderQuad(approx)
  return scoreQuad(quad, width, height) > 0.28 ? quad : null
}

function scaleQuad(quad: DocumentQuad, scaleX: number, scaleY: number): DocumentQuad {
  return quad.map(p => ({ x: p.x * scaleX, y: p.y * scaleY })) as DocumentQuad
}

function normalizeQuad(quad: DocumentQuad, width: number, height: number): DocumentQuad {
  return quad.map(p => ({
    x: Math.min(1, Math.max(0, p.x / Math.max(1, width - 1))),
    y: Math.min(1, Math.max(0, p.y / Math.max(1, height - 1))),
  })) as DocumentQuad
}

export function downscaleImageData(source: ImageData, maxWidth = ANALYSIS_MAX_WIDTH): {
  image: ImageData
  scaleX: number
  scaleY: number
} {
  if (source.width <= maxWidth) {
    return { image: source, scaleX: 1, scaleY: 1 }
  }
  const width = maxWidth
  const height = Math.max(1, Math.round(source.height * (maxWidth / source.width)))
  // Nearest-neighbor downscale (fast, good enough for edges/blur).
  const out = createImageData(width, height)
  for (let y = 0; y < height; y += 1) {
    const sy = Math.min(source.height - 1, Math.floor(y * source.height / height))
    for (let x = 0; x < width; x += 1) {
      const sx = Math.min(source.width - 1, Math.floor(x * source.width / width))
      const si = (sy * source.width + sx) * 4
      const di = (y * width + x) * 4
      out.data[di] = source.data[si]!
      out.data[di + 1] = source.data[si + 1]!
      out.data[di + 2] = source.data[si + 2]!
      out.data[di + 3] = 255
    }
  }
  return {
    image: out,
    scaleX: source.width / width,
    scaleY: source.height / height,
  }
}

export function analyzeDocumentImageData(
  source: ImageData,
  thresholds: Partial<DocumentQualityThresholds> = {},
): DocumentQualityResult {
  const t = { ...DEFAULT_DOCUMENT_QUALITY_THRESHOLDS, ...thresholds }
  const { image, scaleX, scaleY } = downscaleImageData(source)
  const gray = toGray(image)
  const { mean: brightness, std: contrast } = meanStd(gray)
  const blurScore = laplacianVariance(gray, image.width, image.height)
  const quadSmall = findDocumentQuad(gray, image.width, image.height)
  const quad = quadSmall ? scaleQuad(quadSmall, scaleX, scaleY) : null
  const coverage = quad ? quadArea(quad) / (source.width * source.height) : 0

  const blurOk = blurScore >= t.minBlurVariance
  const documentFound = Boolean(quad)
  const coverageOk = documentFound && coverage >= t.minCoverage && coverage <= t.maxCoverage
  const brightnessOk = brightness >= t.minBrightness && brightness <= t.maxBrightness
  const contrastOk = contrast >= t.minContrast

  const issues: string[] = []
  if (!documentFound) issues.push('No page borders found — fill the frame with the paper log')
  else if (!coverageOk) {
    if (coverage < t.minCoverage) issues.push('Move closer — page is too small in the frame')
    else issues.push('Move back — page edges are cut off')
  }
  if (!blurOk) issues.push('Too blurry — hold steady and tap again')
  if (!brightnessOk) {
    if (brightness < t.minBrightness) issues.push('Too dark — turn on flash or add light')
    else issues.push('Too bright — reduce glare or flash')
  }
  if (!contrastOk) issues.push('Low contrast — avoid flat lighting on blank areas')

  const ok = documentFound && coverageOk && blurOk && brightnessOk && contrastOk
  const message = !ok
    ? (issues[0] || 'Adjust the page and try again')
    : (coverage < 0.4
        ? 'Borders locked — a bit closer is even better'
        : 'Borders locked — looking sharp')

  return {
    ok,
    blurScore,
    blurOk,
    documentFound,
    coverage,
    coverageOk,
    brightness,
    brightnessOk,
    contrast,
    contrastOk,
    quad,
    normalizedQuad: quad ? normalizeQuad(quad, source.width, source.height) : null,
    issues,
    message,
    analysisWidth: image.width,
    analysisHeight: image.height,
  }
}

/** Solve 8x8 system for perspective matrix (homography) via Gaussian elimination. */
function computeHomography(src: DocumentQuad, dst: DocumentQuad): number[] | null {
  const A: number[][] = []
  const b: number[] = []
  for (let i = 0; i < 4; i += 1) {
    const { x, y } = src[i]!
    const { x: u, y: v } = dst[i]!
    A.push([x, y, 1, 0, 0, 0, -u * x, -u * y])
    b.push(u)
    A.push([0, 0, 0, x, y, 1, -v * x, -v * y])
    b.push(v)
  }

  // Augment
  const M = A.map((row, i) => [...row, b[i]!])
  const n = 8
  for (let col = 0; col < n; col += 1) {
    let pivot = col
    for (let r = col + 1; r < n; r += 1) {
      if (Math.abs(M[r]![col]!) > Math.abs(M[pivot]![col]!)) pivot = r
    }
    if (Math.abs(M[pivot]![col]!) < 1e-8) return null
    if (pivot !== col) {
      const tmp = M[col]!
      M[col] = M[pivot]!
      M[pivot] = tmp
    }
    const div = M[col]![col]!
    for (let c = col; c <= n; c += 1) M[col]![c]! /= div
    for (let r = 0; r < n; r += 1) {
      if (r === col) continue
      const factor = M[r]![col]!
      for (let c = col; c <= n; c += 1) M[r]![c]! -= factor * M[col]![c]!
    }
  }
  return M.map(row => row[n]!)
}

function applyHomography(h: number[], x: number, y: number): Point2D {
  const denom = h[6]! * x + h[7]! * y + 1
  return {
    x: (h[0]! * x + h[1]! * y + h[2]!) / denom,
    y: (h[3]! * x + h[4]! * y + h[5]!) / denom,
  }
}

/**
 * Perspective-crop the detected document quad into a flat upright image.
 * Returns null if warp cannot be computed.
 */
export function warpDocumentToImageData(source: ImageData, quad: DocumentQuad): ImageData | null {
  const widthTop = dist(quad[0], quad[1])
  const widthBottom = dist(quad[3], quad[2])
  const heightLeft = dist(quad[0], quad[3])
  const heightRight = dist(quad[1], quad[2])
  const outW = Math.max(32, Math.min(2000, Math.round(Math.max(widthTop, widthBottom))))
  const outH = Math.max(32, Math.min(2800, Math.round(Math.max(heightLeft, heightRight))))
  const dst: DocumentQuad = [
    { x: 0, y: 0 },
    { x: outW - 1, y: 0 },
    { x: outW - 1, y: outH - 1 },
    { x: 0, y: outH - 1 },
  ]
  // Inverse map: destination -> source
  const h = computeHomography(dst, quad)
  if (!h) return null

  const out = createImageData(outW, outH, [255, 255, 255, 255])
  for (let y = 0; y < outH; y += 1) {
    for (let x = 0; x < outW; x += 1) {
      const src = applyHomography(h, x, y)
      const sx = src.x
      const sy = src.y
      if (sx < 0 || sy < 0 || sx >= source.width - 1 || sy >= source.height - 1) continue
      const x0 = Math.floor(sx)
      const y0 = Math.floor(sy)
      const dx = sx - x0
      const dy = sy - y0
      const idx = (y * outW + x) * 4
      for (let c = 0; c < 3; c += 1) {
        const i00 = (y0 * source.width + x0) * 4 + c
        const i10 = (y0 * source.width + x0 + 1) * 4 + c
        const i01 = ((y0 + 1) * source.width + x0) * 4 + c
        const i11 = ((y0 + 1) * source.width + x0 + 1) * 4 + c
        const v = (
          source.data[i00]! * (1 - dx) * (1 - dy)
          + source.data[i10]! * dx * (1 - dy)
          + source.data[i01]! * (1 - dx) * dy
          + source.data[i11]! * dx * dy
        )
        out.data[idx + c] = Math.round(v)
      }
      out.data[idx + 3] = 255
    }
  }
  return out
}

export function imageDataToJpegBlob(image: ImageData, quality = 0.92): Promise<Blob | null> {
  if (typeof document === 'undefined') {
    // Node/vitest: no canvas — callers should skip warp encoding in tests.
    return Promise.resolve(null)
  }
  const canvas = document.createElement('canvas')
  canvas.width = image.width
  canvas.height = image.height
  const ctx = canvas.getContext('2d')
  if (!ctx) return Promise.resolve(null)
  ctx.putImageData(image, 0, 0)
  return new Promise(resolve => canvas.toBlob(resolve, 'image/jpeg', quality))
}
