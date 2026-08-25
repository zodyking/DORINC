import { describe, expect, it } from 'vitest'
import {
  formatPercentOffField,
  isDiscountedMoney,
  normalizePercentOff,
  percentOffFromAmount,
  additionalFromInclusiveDiscount,
  displayedInvoiceDiscount,
  resolveInvoiceDiscount,
  resolveLineDiscount,
  sumLineDiscounts,
} from '../../shared/invoice-discount'

describe('invoice discounts', () => {
  it('nets a dollar line discount without changing the unit price', () => {
    const resolved = resolveLineDiscount({
      quantity: '2',
      unitPrice: '145.00',
      discountAmount: '20.00',
    })
    expect(resolved.originalLineAmount).toBe('290.00')
    expect(resolved.discountAmount).toBe('20.00')
    expect(resolved.lineAmount).toBe('270.00')
    expect(isDiscountedMoney(resolved.originalLineAmount, resolved.lineAmount)).toBe(true)
  })

  it('nets a percent line discount from qty × rate', () => {
    const resolved = resolveLineDiscount({
      quantity: '1',
      unitPrice: '100.00',
      discountPercent: '10',
    })
    expect(resolved.discountAmount).toBe('10.00')
    expect(resolved.lineAmount).toBe('90.00')
  })

  it('prefers percent over a leftover dollar amount', () => {
    const resolved = resolveLineDiscount({
      quantity: '1',
      unitPrice: '200.00',
      discountAmount: '5.00',
      discountPercent: '25',
    })
    expect(resolved.discountAmount).toBe('50.00')
    expect(resolved.lineAmount).toBe('150.00')
  })

  it('clamps a line discount to the gross amount', () => {
    const resolved = resolveLineDiscount({
      quantity: '1',
      unitPrice: '40.00',
      discountAmount: '99.00',
    })
    expect(resolved.lineAmount).toBe('0.00')
    expect(resolved.discountAmount).toBe('40.00')
  })

  it('computes a whole-invoice percent from subtotal', () => {
    expect(resolveInvoiceDiscount({
      subtotal: '90.00',
      taxAmount: '0',
      discountPercent: '10',
    })).toBe('9.00')
  })

  it('clamps a whole-invoice dollar discount to subtotal + tax', () => {
    expect(resolveInvoiceDiscount({
      subtotal: '100.00',
      taxAmount: '6.60',
      discountAmount: '500.00',
    })).toBe('106.60')
  })

  it('includes line discounts in the displayed invoice discount and floors additional at that total', () => {
    expect(sumLineDiscounts([
      { quantity: '1', unitPrice: '1275.00', discountAmount: '50.00' },
      { quantity: '1', unitPrice: '100.00', discountPercent: '10' },
    ])).toBe('60.00')
    expect(displayedInvoiceDiscount({
      subtotal: '1315.00',
      discountAmount: '0',
      lineDiscountTotal: '60.00',
    })).toBe('60.00')
    expect(displayedInvoiceDiscount({
      subtotal: '1315.00',
      discountAmount: '25.00',
      lineDiscountTotal: '60.00',
    })).toBe('85.00')
    expect(additionalFromInclusiveDiscount('20.00', '50.00')).toBe('0.00')
    expect(additionalFromInclusiveDiscount('80.00', '50.00')).toBe('30.00')
  })

  it('treats blank and zero percents as not a percent discount', () => {
    expect(normalizePercentOff('')).toBeNull()
    expect(normalizePercentOff('0')).toBeNull()
    expect(formatPercentOffField('10.5000')).toBe('10.5')
    expect(percentOffFromAmount('100.00', '10.00')).toBe('10')
  })
})
