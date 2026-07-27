/** Shared geometry helpers for security geofence zones. */

export interface GeoPoint {
  lat: number
  lng: number
}

export interface GeoBounds {
  minLat: number
  maxLat: number
  minLng: number
  maxLng: number
}

const EARTH_RADIUS_M = 6_371_008.8

function toRadians(degrees: number): number {
  return (degrees * Math.PI) / 180
}

/**
 * Ray-casting point-in-polygon test. The polygon is an ordered list of
 * vertices ({ lat, lng }); the ring is treated as implicitly closed.
 * Returns false for degenerate polygons (fewer than 3 vertices).
 */
export function isPointInPolygon(point: GeoPoint, polygon: GeoPoint[]): boolean {
  if (!Array.isArray(polygon) || polygon.length < 3) return false

  const { lat: y, lng: x } = point
  let inside = false

  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const yi = polygon[i]!.lat
    const xi = polygon[i]!.lng
    const yj = polygon[j]!.lat
    const xj = polygon[j]!.lng

    const intersects = (yi > y) !== (yj > y)
      && x < ((xj - xi) * (y - yi)) / ((yj - yi) || Number.EPSILON) + xi
    if (intersects) inside = !inside
  }

  return inside
}

/** Great-circle distance in metres between two coordinates. */
export function haversineMeters(a: GeoPoint, b: GeoPoint): number {
  const dLat = toRadians(b.lat - a.lat)
  const dLng = toRadians(b.lng - a.lng)
  const lat1 = toRadians(a.lat)
  const lat2 = toRadians(b.lat)

  const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2
  return 2 * EARTH_RADIUS_M * Math.asin(Math.min(1, Math.sqrt(h)))
}

function distanceToSegmentMeters(point: GeoPoint, a: GeoPoint, b: GeoPoint): number {
  // Project onto a local equirectangular plane — accurate enough at the scale
  // of a geofence and far cheaper than a spherical cross-track calculation.
  const latRef = toRadians((a.lat + b.lat) / 2)
  const mPerDegLat = 111_132.92
  const mPerDegLng = 111_412.84 * Math.cos(latRef)

  const px = (point.lng - a.lng) * mPerDegLng
  const py = (point.lat - a.lat) * mPerDegLat
  const bx = (b.lng - a.lng) * mPerDegLng
  const by = (b.lat - a.lat) * mPerDegLat

  const lengthSq = bx * bx + by * by
  if (lengthSq === 0) return Math.hypot(px, py)

  const t = Math.max(0, Math.min(1, (px * bx + py * by) / lengthSq))
  return Math.hypot(px - t * bx, py - t * by)
}

/**
 * Shortest distance in metres from a point to a polygon's edge. Returns 0 when
 * the point is inside — callers use this to apply a GPS-accuracy buffer so a
 * low-confidence fix near the boundary is not treated as outside.
 */
export function distanceToPolygonMeters(point: GeoPoint, polygon: GeoPoint[]): number {
  if (!Array.isArray(polygon) || polygon.length < 3) return Number.POSITIVE_INFINITY
  if (isPointInPolygon(point, polygon)) return 0

  let closest = Number.POSITIVE_INFINITY
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    closest = Math.min(closest, distanceToSegmentMeters(point, polygon[j]!, polygon[i]!))
  }
  return closest
}

/**
 * Inside test that tolerates an uncertainty radius. A point outside the ring
 * but within `bufferMeters` of it counts as inside.
 */
export function isPointInPolygonWithBuffer(
  point: GeoPoint,
  polygon: GeoPoint[],
  bufferMeters = 0,
): boolean {
  if (isPointInPolygon(point, polygon)) return true
  if (bufferMeters <= 0) return false
  return distanceToPolygonMeters(point, polygon) <= bufferMeters
}

export function polygonBounds(polygon: GeoPoint[]): GeoBounds | null {
  if (!Array.isArray(polygon) || !polygon.length) return null
  let minLat = Number.POSITIVE_INFINITY
  let maxLat = Number.NEGATIVE_INFINITY
  let minLng = Number.POSITIVE_INFINITY
  let maxLng = Number.NEGATIVE_INFINITY
  for (const p of polygon) {
    if (p.lat < minLat) minLat = p.lat
    if (p.lat > maxLat) maxLat = p.lat
    if (p.lng < minLng) minLng = p.lng
    if (p.lng > maxLng) maxLng = p.lng
  }
  return { minLat, maxLat, minLng, maxLng }
}

export function polygonCentroid(polygon: GeoPoint[]): GeoPoint | null {
  const bounds = polygonBounds(polygon)
  if (!bounds) return null
  return {
    lat: (bounds.minLat + bounds.maxLat) / 2,
    lng: (bounds.minLng + bounds.maxLng) / 2,
  }
}

/**
 * Ramer–Douglas–Peucker simplification in degrees. Freehand tracing produces
 * hundreds of near-duplicate vertices; simplifying keeps the stored shape and
 * every later point-in-polygon test cheap.
 */
export function simplifyPolygon(polygon: GeoPoint[], toleranceDeg = 0.0002): GeoPoint[] {
  if (!Array.isArray(polygon) || polygon.length <= 3) return [...(polygon ?? [])]

  const perpendicular = (p: GeoPoint, a: GeoPoint, b: GeoPoint): number => {
    const dx = b.lng - a.lng
    const dy = b.lat - a.lat
    if (dx === 0 && dy === 0) return Math.hypot(p.lng - a.lng, p.lat - a.lat)
    const t = ((p.lng - a.lng) * dx + (p.lat - a.lat) * dy) / (dx * dx + dy * dy)
    const clamped = Math.max(0, Math.min(1, t))
    return Math.hypot(p.lng - (a.lng + clamped * dx), p.lat - (a.lat + clamped * dy))
  }

  const keep = new Array<boolean>(polygon.length).fill(false)
  keep[0] = true
  keep[polygon.length - 1] = true

  const stack: Array<[number, number]> = [[0, polygon.length - 1]]
  while (stack.length) {
    const [start, end] = stack.pop()!
    let maxDist = 0
    let index = -1
    for (let i = start + 1; i < end; i++) {
      const dist = perpendicular(polygon[i]!, polygon[start]!, polygon[end]!)
      if (dist > maxDist) {
        maxDist = dist
        index = i
      }
    }
    if (index !== -1 && maxDist > toleranceDeg) {
      keep[index] = true
      stack.push([start, index], [index, end])
    }
  }

  const simplified = polygon.filter((_, i) => keep[i])
  return simplified.length >= 3 ? simplified : [...polygon]
}
