import { describe, expect, it } from 'vitest'
import {
  buildPortalLineItemCorrectionDescription,
  buildPortalVehicleCorrectionDescription,
  portalCorrectionPayloadKind,
  vehicleCorrectionFieldsToSnapshot,
} from '../../shared/portal-invoice-correction'

describe('portal invoice correction helpers', () => {
  it('formats line item correction description', () => {
    const text = buildPortalLineItemCorrectionDescription('INV-000105', {
      kind: 'line_item',
      lineItemId: 'line-1',
      original: {
        description: 'Repair Exhaust Leak',
        quantity: '1.00',
        unitPrice: '650.00',
      },
      proposed: {
        description: 'Repair Exhaust Leak',
        quantity: '0.50',
        unitPrice: '650.00',
      },
      notes: 'Labor should be half hour',
    })

    expect(text).toContain('Invoice: INV-000105')
    expect(text).toContain('Qty/Hours: 0.50')
    expect(text).toContain('Labor should be half hour')
  })

  it('formats vehicle correction description for this invoice only', () => {
    const text = buildPortalVehicleCorrectionDescription('INV-000105', {
      kind: 'vehicle',
      original: {
        busNumber: '616',
        unitTag: null,
        year: 2023,
        make: 'IC BUS',
        model: 'PB105',
        vin: '4DRBUC8N2PB781791',
        plate: null,
        odometer: null,
        odometerUnit: 'mi',
      },
      proposed: {
        busNumber: '616',
        unitTag: null,
        year: 2023,
        make: 'IC BUS',
        model: 'PB105',
        vin: '4DRBUC8N2PB781791',
        plate: 'ABC123',
        odometer: null,
        odometerUnit: 'mi',
      },
    })

    expect(text).toContain('this invoice only')
    expect(text).toContain('Plate: ABC123')
  })

  it('detects correction payload kind', () => {
    expect(portalCorrectionPayloadKind({
      kind: 'line_item',
      lineItemId: 'x',
      original: { description: 'a', quantity: '1', unitPrice: '1' },
      proposed: { description: 'b', quantity: '1', unitPrice: '1' },
    })).toBe('line_item')

    expect(portalCorrectionPayloadKind({
      kind: 'vehicle',
      original: {
        busNumber: '1',
        unitTag: null,
        year: null,
        make: null,
        model: null,
        vin: null,
        plate: null,
        odometer: null,
        odometerUnit: 'mi',
      },
      proposed: {
        busNumber: '1',
        unitTag: null,
        year: null,
        make: null,
        model: null,
        vin: null,
        plate: 'X',
        odometer: null,
        odometerUnit: 'mi',
      },
    })).toBe('vehicle')
  })

  it('maps vehicle correction fields to invoice snapshot', () => {
    const snapshot = vehicleCorrectionFieldsToSnapshot(
      { unitType: 'bus' },
      {
        busNumber: '616',
        unitTag: null,
        year: 2023,
        make: 'IC BUS',
        model: 'PB105',
        vin: 'VIN123',
        plate: 'PLATE1',
        odometer: '12000',
        odometerUnit: 'mi',
      },
    )

    expect(snapshot.unitType).toBe('bus')
    expect(snapshot.plate).toBe('PLATE1')
  })
})
