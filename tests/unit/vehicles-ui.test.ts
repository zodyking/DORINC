import { describe, expect, it } from 'vitest'
import { vehicleSub, vehicleTag, vehicleUnitLine } from '../../app/utils/vehicles-ui'

describe('vehicles-ui helpers', () => {
  it('vehicleUnitLine shows year/make/model without fleet number prefix', () => {
    const v = {
      unitType: 'bus',
      busNumber: '116',
      unitTag: null,
      year: 2011,
      make: 'BUS',
      model: 'PB105',
      trim: null,
    }
    expect(vehicleUnitLine(v)).toBe('2011 BUS PB105')
    expect(vehicleTag(v)).toBe('Bus #116')
    expect(vehicleSub(v)).toBe('2011 BUS PB105')
  })

  it('vehicleUnitLine falls back to tag when ymm is missing', () => {
    const v = {
      unitType: 'truck',
      busNumber: 'HL-114',
      unitTag: null,
      year: null,
      make: null,
      model: null,
      trim: null,
    }
    expect(vehicleUnitLine(v)).toBe('Truck #HL-114')
  })
})
