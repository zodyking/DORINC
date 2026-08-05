import { describe, expect, it } from 'vitest'
import { computeWaivedTaxAmount, resolveInvoicePdfTotals, taxableSubtotalFromLines } from '../../shared/invoice-tax-exempt'
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

  it('derives PDF totals without charging tax when exempt', () => {
    const lines = [
      { lineAmount: '990.00', quantity: '1', unitPrice: '990.00', taxable: true, lineType: 'part' },
      { lineAmount: '425.00', quantity: '1', unitPrice: '425.00', taxable: true, lineType: 'labor' },
    ]
    const resolved = resolveInvoicePdfTotals({
      lineItems: lines,
      taxExempt: true,
      taxRate: taxRatePercentToDecimal('8.875'),
      discountAmount: '0',
      amountPaid: '0',
    })
    expect(resolved.taxAmount).toBe('0')
    expect(resolved.total).toBe('1415.00')
    expect(resolved.balanceDue).toBe('1415.00')
    expect(Number.parseFloat(resolved.waivedTaxAmount ?? '0')).toBeGreaterThan(0)
  })
})
