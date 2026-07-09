// Record payment form helpers (mockup: PAGE: RECORD PAYMENT / P1-25).

import { compareMoney } from '#shared/money'

export const PAYMENT_METHODS = [
  { value: 'ach', label: 'ACH' },
  { value: 'check', label: 'Check' },
  { value: 'cash', label: 'Cash' },
  { value: 'credit_card', label: 'Credit card' },
  { value: 'wire', label: 'Wire' },
] as const

export type PaymentMethod = (typeof PAYMENT_METHODS)[number]['value']

export function paymentMethodLabel(method: PaymentMethod | string): string {
  return PAYMENT_METHODS.find(m => m.value === method)?.label ?? method
}

/** True when invoice can accept a payment (sent with open balance). */
export function canRecordPaymentOnInvoice(status: string, balanceDue: string): boolean {
  return status === 'sent' && compareMoney(balanceDue, '0') > 0
}

/** Client-side guard — server validates with numeric(12,2) math. */
export function validatePaymentAmount(amount: string, balanceDue: string): string | null {
  const trimmed = amount.trim()
  if (!trimmed) return 'Enter a payment amount'
  if (compareMoney(trimmed, '0') <= 0) return 'Amount must be greater than zero'
  if (compareMoney(trimmed, balanceDue) > 0) return 'Amount cannot exceed the open balance'
  return null
}

export function projectedBalanceAfterPayment(balanceDue: string, paymentAmount: string): string {
  if (compareMoney(paymentAmount, balanceDue) >= 0) return '0.00'
  const due = Number.parseFloat(balanceDue)
  const pay = Number.parseFloat(paymentAmount)
  if (!Number.isFinite(due) || !Number.isFinite(pay)) return balanceDue
  return (due - pay).toFixed(2)
}

export function willMarkFullyPaid(balanceDue: string, paymentAmount: string): boolean {
  return compareMoney(paymentAmount, balanceDue) >= 0
}
