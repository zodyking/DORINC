// Record payment form helpers (mockup: PAGE: RECORD PAYMENT / P1-25).

import { addMoney, compareMoney, subtractMoney } from '#shared/money'

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

export interface InvoicePaymentAuditRow {
  id: string
  action: string
  actorName: string | null
  afterData: Record<string, unknown> | null
  createdAt: string
}

export interface InvoicePaymentHistoryRow {
  id: string
  date: string
  method: string
  reference: string
  amount: string
  actorName: string | null
}

/** Build a chronological payment ledger from invoice audit history. */
export function parseInvoicePaymentHistory(
  history: InvoicePaymentAuditRow[],
  opts: { sort?: 'asc' | 'desc' } = {},
): InvoicePaymentHistoryRow[] {
  const rows = history
    .filter(row => row.action === 'invoices.mark_paid')
    .slice()
    .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime())

  let prevPaid = '0'
  const parsed: InvoicePaymentHistoryRow[] = []
  for (const row of rows) {
    const after = row.afterData ?? {}
    const afterPaid = typeof after.amountPaid === 'string' ? after.amountPaid : prevPaid
    let amount = typeof after.paymentAmount === 'string' ? after.paymentAmount : null
    if (!amount || compareMoney(amount, '0') <= 0) {
      amount = subtractMoney(afterPaid, prevPaid)
    }
    const paidAt = typeof after.paidAt === 'string' ? after.paidAt : row.createdAt
    parsed.push({
      id: row.id,
      date: paidAt,
      method: typeof after.method === 'string' ? after.method : '—',
      reference: typeof after.reference === 'string' && after.reference ? after.reference : '—',
      amount,
      actorName: row.actorName,
    })
    prevPaid = afterPaid
  }

  if (opts.sort === 'desc') parsed.reverse()
  return parsed
}

/** Amount paid on the invoice that is not explained by audit payment rows (imports/legacy). */
export function unreconciledPaymentAmount(
  amountPaid: string,
  payments: InvoicePaymentHistoryRow[],
): string | null {
  if (compareMoney(amountPaid, '0') <= 0) return null
  const ledgerTotal = payments.reduce((sum, row) => addMoney(sum, row.amount), '0')
  const diff = subtractMoney(amountPaid, ledgerTotal)
  if (compareMoney(diff, '0') > 0) return diff
  return null
}
