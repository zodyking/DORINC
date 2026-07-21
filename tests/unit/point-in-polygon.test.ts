import { describe, expect, it } from 'vitest'
import { isPointInPolygon } from '../../shared/geo/point-in-polygon'

// A rough square around a region (lat/lng).
const square = [
  { lat: 40, lng: -75 },
  { lat: 40, lng: -73 },
  { lat: 42, lng: -73 },
  { lat: 42, lng: -75 },
]

describe('isPointInPolygon', () => {
  it('returns true for a point inside the polygon', () => {
    expect(isPointInPolygon({ lat: 41, lng: -74 }, square)).toBe(true)
  })

  it('returns false for a point outside the polygon', () => {
    expect(isPointInPolygon({ lat: 50, lng: -74 }, square)).toBe(false)
    expect(isPointInPolygon({ lat: 41, lng: -80 }, square)).toBe(false)
  })

  it('returns false for degenerate polygons', () => {
    expect(isPointInPolygon({ lat: 41, lng: -74 }, [])).toBe(false)
    expect(isPointInPolygon({ lat: 41, lng: -74 }, [{ lat: 40, lng: -75 }])).toBe(false)
    expect(isPointInPolygon({ lat: 41, lng: -74 }, [{ lat: 40, lng: -75 }, { lat: 42, lng: -73 }])).toBe(false)
  })

  it('handles a concave polygon', () => {
    const concave = [
      { lat: 0, lng: 0 },
      { lat: 0, lng: 4 },
      { lat: 4, lng: 4 },
      { lat: 4, lng: 2 },
      { lat: 2, lng: 2 },
      { lat: 2, lng: 0 },
    ]
    expect(isPointInPolygon({ lat: 1, lng: 1 }, concave)).toBe(true)
    expect(isPointInPolygon({ lat: 3, lng: 1 }, concave)).toBe(false)
  })
})
