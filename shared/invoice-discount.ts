/**
 * Invoice and line-item discounts — dollars or percent off.
 * Line discounts reduce that line before tax. Whole-invoice discount
 * is still subtracted from the document total after tax.
 */
import { addMoney, formatMoney, parseMoney, percentOfMoney, subtractMoney, multiplyMoney } from './money'

function asMoney(value: string | null | undefined, fallback = '0'): string {
  const raw = String(value ?? '').trim()
  if (!raw) return fallback
  try {
    return formatMoney(parseMoney(raw))
  }
  catch {
    return fallback
  }
}

/** Normalize a 0–100 percent string. Null/blank/0 means “not a percent discount”. */
export function normalizePercentOff(value: string | null | undefined): string | null {
  if (value == null) return null
  const raw = String(value).trim()
  if (!raw) return null
  const n = Number.parseFloat(raw)
  if (!Number.isFinite(n) || n <= 0) return null
  const capped = Math.min(n, 100)
  const rounded = Math.round(capped * 10000) / 10000
  return Number.isInteger(rounded) ? String(rounded) : String(rounded)
}

/** Persistable percent-off field. Empty/0 becomes null (dollar discount or none). */
export function formatPercentOffField(value: string | number | null | undefined): string | null {
  return normalizePercentOff(value == null ? null : String(value))
}

/** Dollar discount as a percent of `base`, or null when either side is zero. */
export function percentOffFromAmount(base: string, amount: string): string | null {
  try {
    const b = parseMoney(base)
    const a = parseMoney(amount)
    if (b <= 0n || a <= 0n) return null
    const pct = (Number(a) / Number(b)) * 100
    return normalizePercentOff(pct.toFixed(4))
  }
  catch {
    return null
  }
}

export function lineGrossAmount(quantity: string, unitPrice: string): string {
  return multiplyMoney(quantity, unitPrice)
}

export function isDiscountedMoney(original: string, current: string): boolean {
  try {
    return parseMoney(original) > parseMoney(current)
  }
  catch {
    return false
  }
}

export interface LineDiscountInput {
  quantity: string
  unitPrice: string
  discountAmount?: string | null
  discountPercent?: string | null
}

export interface ResolvedLineDiscount {
  originalLineAmount: string
  discountAmount: string
  lineAmount: string
}

/** Net line amount after an optional $ or % discount. Percent wins when set. */
export function resolveLineDiscount(input: LineDiscountInput): ResolvedLineDiscount {
  const originalLineAmount = lineGrossAmount(input.quantity, input.unitPrice)
  const percent = normalizePercentOff(input.discountPercent)
  let discountAmount = '0'
  if (percent) {
    discountAmount = percentOfMoney(originalLineAmount, percent)
  }
  else if (input.discountAmount) {
    discountAmount = asMoney(input.discountAmount, '0')
  }
  if (parseMoney(discountAmount) < 0n) discountAmount = '0'
  if (parseMoney(discountAmount) > parseMoney(originalLineAmount)) {
    discountAmount = originalLineAmount
  }
  return {
    originalLineAmount,
    discountAmount,
    lineAmount: subtractMoney(originalLineAmount, discountAmount),
  }
}

export interface InvoiceDiscountInput {
  subtotal: string
  taxAmount?: string
  feesAmount?: string
  discountAmount?: string | null
  discountPercent?: string | null
}

/** Whole-invoice discount in dollars. Percent is of subtotal; result is clamped to the pre-discount total. */
export function resolveInvoiceDiscount(input: InvoiceDiscountInput): string {
  const max = addMoney(input.subtotal, input.feesAmount ?? '0', input.taxAmount ?? '0')
  const percent = normalizePercentOff(input.discountPercent)
  let amount = '0'
  if (percent) amount = percentOfMoney(input.subtotal, percent)
  else if (input.discountAmount) amount = asMoney(input.discountAmount, '0')
  if (parseMoney(amount) < 0n) amount = '0'
  if (parseMoney(amount) > parseMoney(max)) amount = max
  return amount
}
