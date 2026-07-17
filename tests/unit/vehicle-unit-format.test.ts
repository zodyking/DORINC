import { describe, expect, it } from 'vitest'
import {
  formatVehicleUnitLabel,
  splitEntitySearchTokens,
  vehicleUnitSearchText,
} from '../../shared/format/vehicle-unit'

describe('vehicle-unit format', () => {
  it('formats tagged bus as Bus #2', () => {
    expect(formatVehicleUnitLabel({ unitType: 'bus', unitTag: '2' })).toBe('Bus #2')
  })

  it('prefers unit tag over bus number for label number', () => {
    expect(formatVehicleUnitLabel({ unitType: 'bus', unitTag: '02', busNumber: '10' })).toBe('Bus #02')
  })

  it('falls back to bus number when no unit tag', () => {
    expect(formatVehicleUnitLabel({ unitType: 'truck', busNumber: 'HL-114' })).toBe('Truck #HL-114')
  })

  it('splits multi-token search queries', () => {
    expect(splitEntitySearchTokens('Camp Pupa 102')).toEqual(['camp', 'pupa', '102'])
  })

  it('includes customer and unit in search text', () => {
    const hay = vehicleUnitSearchText({
      unitType: 'bus',
      unitTag: '102',
      customerName: 'Camp Pupa',
      make: 'INTERNATIONAL',
      model: '3800',
    })
    expect(hay).toContain('bus #102')
    expect(hay).toContain('camp pupa')
  })
})
