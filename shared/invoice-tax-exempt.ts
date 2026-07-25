import { addMoney, multiplyMoney, rateOfMoney } from './money'

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
