import { computeWaivedTaxAmount } from '../../shared/invoice-tax-exempt'
import { addMoney, multiplyMoney, rateOfMoney, subtractMoney } from '../../shared/money'

export interface InvoiceLineTotalsInput {
  quantity: string
  unitPrice: string
  taxable: boolean
}

export interface InvoiceTotalsInput {
  lines: InvoiceLineTotalsInput[]
  taxExempt: boolean
  /** Decimal rate e.g. "0.066000" for 6.6% */
  taxRate?: string
  discountAmount?: string
  amountPaid?: string
}

export interface InvoiceTotalsResult {
  subtotal: string
  taxAmount: string
  /** Tax that would apply if not exempt — display only when taxExempt is true. */
  waivedTaxAmount: string | null
  discountAmount: string
  feesAmount: string
  total: string
  amountPaid: string
  balanceDue: string
  taxableSubtotal: string
}

export function lineAmount(quantity: string, unitPrice: string): string {
  return multiplyMoney(quantity, unitPrice)
}

/** Server-side invoice totals — subtotal, tax, discount, balance (SPEC §6.5). */
export function calculateInvoiceTotals(input: InvoiceTotalsInput): InvoiceTotalsResult {
  const discountAmount = input.discountAmount ?? '0'
  const amountPaid = input.amountPaid ?? '0'
  const taxRate = input.taxRate ?? '0'

  const lineAmounts = input.lines.map(line => lineAmount(line.quantity, line.unitPrice))
  const subtotal = lineAmounts.length ? addMoney(...lineAmounts) : '0'

  const taxableLines = input.lines
    .filter(line => line.taxable)
    .map(line => lineAmount(line.quantity, line.unitPrice))
  const taxableSubtotal = taxableLines.length ? addMoney(...taxableLines) : '0'

  const feesAmount = '0'

  const waivedTaxAmount = computeWaivedTaxAmount({
    taxExempt: input.taxExempt,
    taxRate,
    taxableSubtotal,
  })
  const taxAmount = input.taxExempt
    ? '0'
    : rateOfMoney(taxableSubtotal, taxRate)

  const total = subtractMoney(
    addMoney(subtotal, feesAmount, taxAmount),
    discountAmount,
  )

  const balanceDue = subtractMoney(total, amountPaid)

  return {
    subtotal,
    taxAmount,
    waivedTaxAmount,
    discountAmount,
    feesAmount,
    total,
    amountPaid,
    balanceDue,
    taxableSubtotal,
  }
}
