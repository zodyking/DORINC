/** Shared geometry helpers for the access-gate geofence. */

export interface GeoPoint {
  lat: number
  lng: number
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
