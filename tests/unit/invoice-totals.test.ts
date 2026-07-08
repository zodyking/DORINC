import { describe, expect, it } from 'vitest'
import { calculateInvoiceTotals, lineAmount } from '../../server/services/invoice-totals.service'

describe('P1-20 invoice totals (server-side)', () => {
  it('computes subtotal from line qty × rate', () => {
    expect(lineAmount('2', '145.00')).toBe('290.00')
    expect(lineAmount('1.5', '145.00')).toBe('217.50')
    expect(lineAmount('1', '412.68')).toBe('412.68')

    const result = calculateInvoiceTotals({
      lines: [
        { quantity: '2', unitPrice: '145.00', taxable: true },
        { quantity: '1', unitPrice: '412.68', taxable: true },
        { quantity: '1.5', unitPrice: '145.00', taxable: true },
      ],
      taxExempt: true,
    })

    expect(result.subtotal).toBe('920.18')
    expect(result.total).toBe('920.18')
    expect(result.balanceDue).toBe('920.18')
  })

  it('applies shop supplies percent and flat fees', () => {
    const result = calculateInvoiceTotals({
      lines: [
        { quantity: '2', unitPrice: '145.00', taxable: true },
        { quantity: '1', unitPrice: '412.68', taxable: true },
        { quantity: '1.5', unitPrice: '145.00', taxable: true },
      ],
      taxExempt: true,
      shopSuppliesPercent: '3.5',
    })

    expect(result.subtotal).toBe('920.18')
    expect(result.feesAmount).toBe('32.21')
    expect(result.total).toBe('952.39')
  })

  it('calculates tax on taxable lines when customer is not exempt', () => {
    const result = calculateInvoiceTotals({
      lines: [
        { quantity: '1', unitPrice: '100.00', taxable: true },
        { quantity: '1', unitPrice: '50.00', taxable: false },
      ],
      taxExempt: false,
      taxRate: '0.066000',
    })

    expect(result.subtotal).toBe('150.00')
    expect(result.taxableSubtotal).toBe('100.00')
    expect(result.taxAmount).toBe('6.60')
    expect(result.total).toBe('156.60')
  })

  it('skips tax when customer is tax exempt', () => {
    const result = calculateInvoiceTotals({
      lines: [{ quantity: '1', unitPrice: '100.00', taxable: true }],
      taxExempt: true,
      taxRate: '0.066000',
    })

    expect(result.taxAmount).toBe('0')
    expect(result.total).toBe('100.00')
  })

  it('applies header fees and payments for balance due', () => {
    const result = calculateInvoiceTotals({
      lines: [
        { quantity: '2', unitPrice: '145.00', taxable: false },
        { quantity: '1', unitPrice: '412.68', taxable: false },
        { quantity: '1.5', unitPrice: '145.00', taxable: false },
        { quantity: '1', unitPrice: '64.20', taxable: false },
        { quantity: '1', unitPrice: '95.00', taxable: false },
        { quantity: '1', unitPrice: '38.50', taxable: false },
      ],
      taxExempt: true,
      feesAmount: '24.00',
      amountPaid: '300.00',
    })

    expect(result.subtotal).toBe('1117.88')
    expect(result.feesAmount).toBe('24.00')
    expect(result.total).toBe('1141.88')
    expect(result.amountPaid).toBe('300.00')
    expect(result.balanceDue).toBe('841.88')
  })

  it('applies discount before balance due', () => {
    const result = calculateInvoiceTotals({
      lines: [{ quantity: '1', unitPrice: '500.00', taxable: false }],
      discountAmount: '50.00',
      amountPaid: '100.00',
    })

    expect(result.subtotal).toBe('500.00')
    expect(result.discountAmount).toBe('50.00')
    expect(result.total).toBe('450.00')
    expect(result.balanceDue).toBe('350.00')
  })

  it('matches mockup editor totals with shop supplies fee', () => {
    const result = calculateInvoiceTotals({
      lines: [
        { quantity: '2', unitPrice: '145.00', taxable: true },
        { quantity: '1', unitPrice: '412.68', taxable: true },
        { quantity: '1.5', unitPrice: '145.00', taxable: true },
      ],
      taxExempt: true,
      shopSuppliesPercent: '3.5',
      amountPaid: '0',
    })

    expect(result.total).toBe('952.39')
    expect(result.balanceDue).toBe('952.39')
  })
})
