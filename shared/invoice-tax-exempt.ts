import { addMoney, multiplyMoney, rateOfMoney, subtractMoney } from './money'

export interface TaxableLineInput {
  quantity: string
  unitPrice: string
  taxable?: boolean
}

export function taxableSubtotalFromLines(lines: TaxableLineInput[]): string {
  const amounts = lines
    .filter(line => line.taxable !== false)
    .map(line => multiplyMoney(line.quantity, line.unitPrice))
  return amounts.length ? addMoney(...amounts) : '0'
}

/** Tax that would apply if the customer were not exempt — for display only. */
export function computeWaivedTaxAmount(input: {
  taxExempt: boolean
  taxRate?: string | null
  taxableSubtotal: string
}): string | null {
  if (!input.taxExempt) return null
  const rate = input.taxRate ?? '0'
  if (!rate || rate === '0') return null
  const waived = rateOfMoney(input.taxableSubtotal, rate)
  return Number.parseFloat(waived) > 0 ? waived : null
}

/** PDF/display totals derived from line items — matches server invoice-totals rules. */
export function resolveInvoicePdfTotals(input: {
  lineItems: Array<{ lineAmount: string, quantity?: string, unitPrice?: string, taxable?: boolean }>
  taxExempt?: boolean
  taxRate?: string | null
  feesAmount?: string
  discountAmount?: string
  amountPaid?: string
}) {
  const taxExempt = input.taxExempt ?? false
  const taxRate = input.taxRate ?? '0'
  const feesAmount = input.feesAmount ?? '0'
  const discountAmount = input.discountAmount ?? '0'
  const amountPaid = input.amountPaid ?? '0'

  const lineAmounts = input.lineItems.map(line => line.lineAmount)
  const subtotal = lineAmounts.length ? addMoney(...lineAmounts) : '0'
  const taxableSubtotal = taxableSubtotalFromLines(input.lineItems)
  const waivedTaxAmount = computeWaivedTaxAmount({ taxExempt, taxRate, taxableSubtotal })
  const taxAmount = taxExempt ? '0' : rateOfMoney(taxableSubtotal, taxRate)
  const total = subtractMoney(addMoney(subtotal, feesAmount, taxAmount), discountAmount)
  const balanceDue = subtractMoney(total, amountPaid)

  return {
    taxExempt,
    taxAmount,
    waivedTaxAmount,
    total,
    balanceDue,
  }
}
