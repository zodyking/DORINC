import { describe, expect, it } from 'vitest'
import {
  accessGateDayBounds,
  accessGateDayKey,
  formatAccessGateDayLabel,
  parseAccessGateDayKey,
  shiftAccessGateDayKey,
} from '../../app/utils/access-gate-map'
import { isOutsideGeoSessionFlag } from '../../shared/outside-geo-session'

describe('access gate day controls', () => {
  it('parses and shifts local day keys', () => {
    expect(parseAccessGateDayKey('2026-08-10')).toBeInstanceOf(Date)
    expect(parseAccessGateDayKey('nope')).toBeNull()
    expect(shiftAccessGateDayKey('2026-08-10', 1)).toBe('2026-08-11')
    expect(shiftAccessGateDayKey('2026-08-10', -1)).toBe('2026-08-09')
  })

  it('builds day bounds for API filtering', () => {
    const bounds = accessGateDayBounds('2026-08-10')
    expect(bounds).not.toBeNull()
    expect(new Date(bounds!.from).getTime()).toBeLessThan(new Date(bounds!.to).getTime())
    expect(formatAccessGateDayLabel('2026-08-10')).toMatch(/Aug/)
    expect(accessGateDayKey(new Date(2026, 7, 10))).toBe('2026-08-10')
  })
})

describe('outside geo tab session flag', () => {
  it('accepts common truthy encodings', () => {
    expect(isOutsideGeoSessionFlag('1')).toBe(true)
    expect(isOutsideGeoSessionFlag('true')).toBe(true)
    expect(isOutsideGeoSessionFlag(true)).toBe(true)
    expect(isOutsideGeoSessionFlag('0')).toBe(false)
    expect(isOutsideGeoSessionFlag(undefined)).toBe(false)
  })
})
