import { describe, expect, it } from 'vitest'
import {
  canRecordPaymentOnInvoice,
  parseInvoicePaymentHistory,
  paymentMethodLabel,
  projectedBalanceAfterPayment,
  unreconciledPaymentAmount,
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

  it('parses payment history from audit rows including inferred partial amounts', () => {
    const history = [
      {
        id: 'a',
        action: 'invoices.mark_paid',
        actorName: 'Alex',
        createdAt: '2026-01-10T12:00:00.000Z',
        afterData: {
          amountPaid: '100.00',
          paymentAmount: '100.00',
          method: 'ACH',
          reference: 'ACH-1',
          paidAt: '2026-01-10',
        },
      },
      {
        id: 'b',
        action: 'invoices.mark_paid',
        actorName: 'Alex',
        createdAt: '2026-01-20T12:00:00.000Z',
        afterData: {
          amountPaid: '250.00',
          method: 'Check',
          paidAt: '2026-01-20',
        },
      },
    ]
    const rows = parseInvoicePaymentHistory(history)
    expect(rows).toHaveLength(2)
    expect(rows[0]!.amount).toBe('100.00')
    expect(rows[1]!.amount).toBe('150.00')
    expect(unreconciledPaymentAmount('250.00', rows)).toBeNull()
    expect(unreconciledPaymentAmount('300.00', rows)).toBe('50.00')
  })

  it('projects balance after partial payment', () => {
    expect(projectedBalanceAfterPayment('841.88', '400.00')).toBe('441.88')
    expect(projectedBalanceAfterPayment('841.88', '841.88')).toBe('0.00')
  })
})
