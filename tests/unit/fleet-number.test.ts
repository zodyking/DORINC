import { describe, expect, it } from 'vitest'
import {
  FLEET_NUMBER_PLACEHOLDER,
  FLEET_NUMBER_REJECT_MESSAGE,
  fleetNumberHasRejectedPhrase,
  fleetNumberRequiredSchema,
} from '../../shared/validators/fleet-number'

describe('fleet number validation', () => {
  it('exposes placeholder and reject message', () => {
    expect(FLEET_NUMBER_PLACEHOLDER).toBe('Fleet number (number only)')
    expect(FLEET_NUMBER_REJECT_MESSAGE).toContain('vehicle type')
  })

  it('allows plain fleet numbers', () => {
    expect(fleetNumberHasRejectedPhrase('616')).toBe(false)
    expect(fleetNumberHasRejectedPhrase('HL-120')).toBe(false)
    expect(fleetNumberHasRejectedPhrase('')).toBe(false)
  })

  it('rejects vehicle type words and hash symbols', () => {
    expect(fleetNumberHasRejectedPhrase('Bus #616')).toBe(true)
    expect(fleetNumberHasRejectedPhrase('bus 616')).toBe(true)
    expect(fleetNumberHasRejectedPhrase('Truck #HL-12')).toBe(true)
    expect(fleetNumberHasRejectedPhrase('CAR-9')).toBe(true)
    expect(fleetNumberHasRejectedPhrase('tractor 4')).toBe(true)
    expect(fleetNumberHasRejectedPhrase('#616')).toBe(true)
  })

  it('is case-insensitive', () => {
    expect(fleetNumberHasRejectedPhrase('BUS 616')).toBe(true)
    expect(fleetNumberHasRejectedPhrase('truck616')).toBe(false)
  })

  it('validates required schema', () => {
    expect(fleetNumberRequiredSchema(40).safeParse('616').success).toBe(true)
    expect(fleetNumberRequiredSchema(40).safeParse('Bus #1').success).toBe(false)
  })
})
