import { describe, expect, it } from 'vitest'
import { computeWaivedTaxAmount, taxableSubtotalFromLines } from '../../shared/invoice-tax-exempt'
import { taxRatePercentToDecimal } from '../../shared/tax'

describe('invoice tax exempt helpers', () => {
  it('sums only taxable lines', () => {
    expect(taxableSubtotalFromLines([
      { quantity: '1', unitPrice: '100.00', taxable: true },
      { quantity: '1', unitPrice: '50.00', taxable: false },
    ])).toBe('100.00')
  })

  it('treats missing taxable flag as taxable', () => {
    expect(taxableSubtotalFromLines([
      { quantity: '1', unitPrice: '145.00' },
    ])).toBe('145.00')
  })

  it('returns waived tax for exempt customers', () => {
    expect(computeWaivedTaxAmount({
      taxExempt: true,
      taxRate: taxRatePercentToDecimal('6.6'),
      taxableSubtotal: '145.00',
    })).toBe('9.57')
  })

  it('returns null when customer is not exempt', () => {
    expect(computeWaivedTaxAmount({
      taxExempt: false,
      taxRate: taxRatePercentToDecimal('6.6'),
      taxableSubtotal: '145.00',
    })).toBeNull()
  })
})
