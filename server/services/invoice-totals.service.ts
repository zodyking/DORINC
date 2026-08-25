import { computeWaivedTaxAmount } from '../../shared/invoice-tax-exempt'
import { resolveInvoiceDiscount, resolveLineDiscount } from '../../shared/invoice-discount'
import { addMoney, multiplyMoney, rateOfMoney, subtractMoney } from '../../shared/money'

export interface InvoiceLineTotalsInput {
  quantity: string
  unitPrice: string
  taxable: boolean
  discountAmount?: string | null
  discountPercent?: string | null
}

export interface InvoiceTotalsInput {
  lines: InvoiceLineTotalsInput[]
  taxExempt: boolean
  /** Decimal rate e.g. "0.066000" for 6.6% */
  taxRate?: string
  discountAmount?: string
  discountPercent?: string | null
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

export function netLineAmount(line: InvoiceLineTotalsInput): string {
  return resolveLineDiscount(line).lineAmount
}

/** Server-side invoice totals — subtotal, tax, discount, balance (SPEC §6.5). */
export function calculateInvoiceTotals(input: InvoiceTotalsInput): InvoiceTotalsResult {
  const amountPaid = input.amountPaid ?? '0'
  const taxRate = input.taxRate ?? '0'

  const resolvedLines = input.lines.map(line => ({
    ...resolveLineDiscount(line),
    taxable: line.taxable,
  }))
  const lineAmounts = resolvedLines.map(line => line.lineAmount)
  const subtotal = lineAmounts.length ? addMoney(...lineAmounts) : '0'

  const taxableLines = resolvedLines
    .filter(line => line.taxable)
    .map(line => line.lineAmount)
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

  const discountAmount = resolveInvoiceDiscount({
    subtotal,
    taxAmount,
    feesAmount,
    discountAmount: input.discountAmount,
    discountPercent: input.discountPercent,
  })

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
