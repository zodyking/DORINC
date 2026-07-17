import { describe, expect, it } from 'vitest'
import { formatTaxRatePercent, taxRatePercentToDecimal } from '../../shared/tax'
import { calculateInvoiceTotals } from '../../server/services/invoice-totals.service'

describe('tax helpers', () => {
  it('converts percent to decimal rate', () => {
    expect(taxRatePercentToDecimal('6.6')).toBe('0.066000')
    expect(taxRatePercentToDecimal('0')).toBe('0')
    expect(taxRatePercentToDecimal('')).toBe('0')
  })

  it('formats decimal rate for display', () => {
    expect(formatTaxRatePercent('0.066')).toBe('6.6%')
    expect(formatTaxRatePercent('0')).toBe('0%')
  })
})

describe('invoice tax calculation', () => {
  it('applies default tax rate to taxable lines', () => {
    const totals = calculateInvoiceTotals({
      lines: [{ quantity: '1', unitPrice: '100.00', taxable: true }],
      taxExempt: false,
      taxRate: taxRatePercentToDecimal('6.6'),
    })
    expect(totals.taxAmount).toBe('6.60')
    expect(totals.total).toBe('106.60')
  })

  it('zeroes tax for exempt customers', () => {
    const totals = calculateInvoiceTotals({
      lines: [{ quantity: '1', unitPrice: '100.00', taxable: true }],
      taxExempt: true,
      taxRate: taxRatePercentToDecimal('6.6'),
    })
    expect(totals.taxAmount).toBe('0')
    expect(totals.total).toBe('100.00')
  })
})
