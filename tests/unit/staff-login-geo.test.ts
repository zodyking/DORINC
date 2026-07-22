import { describe, expect, it } from 'vitest'
import { mapStaffLoginGeoError, staffLoginGeoErrorMessage } from '../../app/utils/staff-login-geo'

describe('staff login geolocation helpers', () => {
  it('maps permission denied to actionable copy', () => {
    expect(staffLoginGeoErrorMessage('GEO_PERMISSION_DENIED'))
      .toMatch(/location access/i)
  })

  it('maps geolocation errors from thrown codes', () => {
    expect(mapStaffLoginGeoError(new Error('GEO_TIMEOUT'))).toContain('timed out')
    expect(mapStaffLoginGeoError(new Error('GEO_UNAVAILABLE'))).toContain('does not support')
  })
})
