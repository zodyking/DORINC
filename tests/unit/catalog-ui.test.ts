import { describe, expect, it } from 'vitest'
import {
  catalogPriceDisplay,
  catalogTypeLabel,
  catalogTypePill,
} from '../../app/utils/catalog-ui'

describe('catalog-ui helpers (P1-19)', () => {
  it('labels and pills match mockup types', () => {
    expect(catalogTypeLabel('part')).toBe('Part')
    expect(catalogTypeLabel('labor')).toBe('Labor')
    expect(catalogTypePill('part')).toBe('pill ok')
    expect(catalogTypePill('fee')).toBe('pill gray')
  })

  it('formats prices like the catalog table mockup', () => {
    expect(catalogPriceDisplay('145.00', 'hr', 'labor')).toBe('$145.00 / hr')
    expect(catalogPriceDisplay('95.00', 'flat', 'labor')).toBe('$95.00 flat')
    expect(catalogPriceDisplay('3.5', 'pct', 'fee')).toBe('3.5%')
    expect(catalogPriceDisplay('412.68', 'each', 'part')).toBe('$412.68')
  })
})
