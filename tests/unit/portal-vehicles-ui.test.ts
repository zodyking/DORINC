import { describe, expect, it } from 'vitest'
import {
  formatPortalDecodedVehicle,
  normalizePortalVin,
  portalVehicleCountLabel,
  portalVehicleLastService,
  portalVinLooksComplete,
} from '../../app/utils/portal-vehicles-ui'

describe('portal-vehicles-ui helpers (P2-06)', () => {
  it('formats fleet count label', () => {
    expect(portalVehicleCountLabel(1)).toBe('1 unit')
    expect(portalVehicleCountLabel(4)).toBe('4 units')
  })

  it('formats last service date', () => {
    expect(portalVehicleLastService('2026-07-03')).toMatch(/Jul 3, 2026/)
    expect(portalVehicleLastService(null)).toBe('—')
  })

  it('normalizes VIN input', () => {
    expect(normalizePortalVin(' 4drbuc8n2pb781791 ')).toBe('4DRBUC8N2PB781791')
    expect(portalVinLooksComplete('4DRBUC8N2PB781791')).toBe(true)
    expect(portalVinLooksComplete('4DRBUC8')).toBe(false)
  })

  it('formats decoded vehicle summary', () => {
    expect(formatPortalDecodedVehicle(2023, 'FREIGHTLINER', 'Cascadia')).toBe('2023 FREIGHTLINER Cascadia')
    expect(formatPortalDecodedVehicle(null, null, null)).toBe('—')
  })
})
