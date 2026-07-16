import { describe, expect, it } from 'vitest'
import { mapPortalCategoryToWorkType } from '../../shared/portal-service-log'

describe('mapPortalCategoryToWorkType', () => {
  it('maps portal categories to service log work types', () => {
    expect(mapPortalCategoryToWorkType('Preventive maintenance')).toBe('preventive_maintenance')
    expect(mapPortalCategoryToWorkType('Repair / breakdown')).toBe('repair')
    expect(mapPortalCategoryToWorkType('Diagnostic / check engine')).toBe('diagnostic')
    expect(mapPortalCategoryToWorkType('Other')).toBe('other')
  })
})
