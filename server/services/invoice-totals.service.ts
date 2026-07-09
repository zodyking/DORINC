import { addMoney, multiplyMoney, percentOfMoney, rateOfMoney, subtractMoney } from '../../shared/money'

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
  /** Flat header-level fees (fuel surcharge, etc.) */
  feesAmount?: string
  /** Percent fee applied to subtotal (shop supplies) e.g. "3.5" */
  shopSuppliesPercent?: string
  discountAmount?: string
  amountPaid?: string
}

export interface InvoiceTotalsResult {
  subtotal: string
  taxAmount: string
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

/** Server-side invoice totals — subtotal, tax, discount, fees, balance (SPEC §6.5). */
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

  const percentFees = input.shopSuppliesPercent
    ? percentOfMoney(subtotal, input.shopSuppliesPercent)
    : '0'
  const flatFees = input.feesAmount ?? '0'
  const feesAmount = addMoney(percentFees, flatFees)

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
    discountAmount,
    feesAmount,
    total,
    amountPaid,
    balanceDue,
    taxableSubtotal,
  }
}
