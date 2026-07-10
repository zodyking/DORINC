import { describe, expect, it } from 'vitest'
import {
  catalogPriceDisplay,
  catalogTypeLabel,
  catalogTypePill,
  defaultUomForCatalogType,
  normalizeCatalogItemType,
} from '../../app/utils/catalog-ui'

describe('catalog-ui helpers (P1-19)', () => {
  it('labels and pills match catalog types', () => {
    expect(catalogTypeLabel('part')).toBe('Part')
    expect(catalogTypeLabel('service')).toBe('Service')
    expect(catalogTypeLabel('fee')).toBe('Fee')
    expect(catalogTypePill('part')).toBe('pill ok')
    expect(catalogTypePill('fee')).toBe('pill gray')
  })

  it('normalizes legacy labor rows to service', () => {
    expect(normalizeCatalogItemType('labor')).toBe('service')
    expect(catalogTypeLabel('labor')).toBe('Service')
  })

  it('formats prices like the catalog table', () => {
    expect(catalogPriceDisplay('145.00', 'hr', 'service')).toBe('$145.00 / hr')
    expect(catalogPriceDisplay('95.00', 'flat', 'service')).toBe('$95.00 flat')
    expect(catalogPriceDisplay('3.5', 'pct', 'fee')).toBe('3.5%')
    expect(catalogPriceDisplay('412.68', 'each', 'part')).toBe('$412.68')
  })

  it('picks sensible default units per type', () => {
    expect(defaultUomForCatalogType('part')).toBe('each')
    expect(defaultUomForCatalogType('service')).toBe('hr')
    expect(defaultUomForCatalogType('fee')).toBe('pct')
  })
})
