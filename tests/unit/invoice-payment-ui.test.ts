import { describe, expect, it } from 'vitest'
import {
  canRecordPaymentOnInvoice,
  paymentMethodLabel,
  validatePaymentAmount,
  willMarkFullyPaid,
} from '../../app/utils/invoice-payment-ui'

describe('invoice-payment-ui helpers (P1-25)', () => {
  it('allows payment only on sent invoices with balance', () => {
    expect(canRecordPaymentOnInvoice('sent', '841.88')).toBe(true)
    expect(canRecordPaymentOnInvoice('approved', '100.00')).toBe(false)
    expect(canRecordPaymentOnInvoice('sent', '0.00')).toBe(false)
    expect(canRecordPaymentOnInvoice('paid', '0.00')).toBe(false)
  })

  it('validates payment amounts against balance', () => {
    expect(validatePaymentAmount('841.88', '841.88')).toBeNull()
    expect(validatePaymentAmount('900.00', '841.88')).toMatch(/exceed/)
    expect(validatePaymentAmount('0', '841.88')).toMatch(/greater than zero/)
    expect(validatePaymentAmount('', '841.88')).toMatch(/Enter/)
  })

  it('detects full vs partial settlement', () => {
    expect(willMarkFullyPaid('841.88', '841.88')).toBe(true)
    expect(willMarkFullyPaid('841.88', '400.00')).toBe(false)
  })

  it('labels payment methods like the mockup', () => {
    expect(paymentMethodLabel('ach')).toBe('ACH')
    expect(paymentMethodLabel('credit_card')).toBe('Credit card')
  })
})
