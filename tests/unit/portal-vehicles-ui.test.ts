import { describe, expect, it } from 'vitest'
import { portalVehicleCountLabel, portalVehicleLastService } from '../../app/utils/portal-vehicles-ui'

describe('portal-vehicles-ui helpers (P2-06)', () => {
  it('formats fleet count label', () => {
    expect(portalVehicleCountLabel(1)).toBe('1 unit')
    expect(portalVehicleCountLabel(4)).toBe('4 units')
  })

  it('formats last service date', () => {
    expect(portalVehicleLastService('2026-07-03')).toMatch(/Jul 3, 2026/)
    expect(portalVehicleLastService(null)).toBe('—')
  })
})
