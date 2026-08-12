import { describe, expect, it } from 'vitest'
import {
  OUTSIDE_GEO_SESSION_HEADER,
  OUTSIDE_GEO_SESSION_STORAGE_KEY,
  isOutsideGeoSessionFlag,
} from '../../shared/outside-geo-session'

describe('outside geo tab session', () => {
  it('recognizes armed session flags', () => {
    expect(isOutsideGeoSessionFlag('1')).toBe(true)
    expect(isOutsideGeoSessionFlag('true')).toBe(true)
    expect(isOutsideGeoSessionFlag(true)).toBe(true)
    expect(isOutsideGeoSessionFlag('0')).toBe(false)
    expect(isOutsideGeoSessionFlag(null)).toBe(false)
  })

  it('exports stable client header and storage keys', () => {
    expect(OUTSIDE_GEO_SESSION_HEADER).toBe('x-outside-geo-session')
    expect(OUTSIDE_GEO_SESSION_STORAGE_KEY).toBe('dorinc_outside_geo_session')
  })
})
