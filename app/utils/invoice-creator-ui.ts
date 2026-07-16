// Invoice creator wizard helpers (mockup: PAGE: INVOICE CREATOR / P1-23).

import { addMoney, multiplyMoney } from '#shared/money'
import type { InvoiceLineType } from './invoices-ui'

export const INVOICE_WIZARD_STEPS = [
  { n: 1, label: 'Customer' },
  { n: 2, label: 'Vehicle' },
  { n: 3, label: 'Line items' },
  { n: 4, label: 'Review' },
] as const

export const LINE_TYPE_OPTIONS: { value: InvoiceLineType, label: string }[] = [
  { value: 'labor', label: 'Labor' },
  { value: 'part', label: 'Part' },
  { value: 'fee', label: 'Fee' },
]

const TERMS_DAYS: Record<string, number> = {
  due_on_receipt: 0,
  net_15: 15,
  net_30: 30,
  net_45: 45,
  net_60: 60,
}

export interface DraftLine {
  localId: string
  lineType: InvoiceLineType
  description: string
  quantity: string
  unitPrice: string
  catalogItemId?: string | null
  serverId?: string
  lineAmount?: string
}

/** Compute due date from issue date + payment terms (display default only — API stores explicit dueDate). */
export function dueDateFromTerms(invoiceDate: string, terms: string): string {
  const base = new Date(`${invoiceDate}T12:00:00`)
  if (Number.isNaN(base.getTime())) return invoiceDate
  const add = TERMS_DAYS[terms] ?? 30
  base.setDate(base.getDate() + add)
  return base.toISOString().slice(0, 10)
}

export function wizardStateLabel(step: number): string {
  const s = INVOICE_WIZARD_STEPS.find(x => x.n === step)
  return `Step ${step} of ${INVOICE_WIZARD_STEPS.length} — ${s?.label ?? ''}`
}

export function formatInvoiceNumberDisplay(invoiceNumber: number): string {
  return `INV-${String(invoiceNumber).padStart(6, '0')}`
}

export function createEmptyLine(): DraftLine {
  return {
    localId: crypto.randomUUID(),
    lineType: 'labor',
    description: '',
    quantity: '1',
    unitPrice: '145.00',
    catalogItemId: null,
  }
}

export function isDraftLineValid(line: DraftLine): boolean {
  return line.description.trim().length > 0
    && Number.parseFloat(line.quantity) > 0
    && Number.parseFloat(line.unitPrice) >= 0
}

/** Normalize qty/rate strings from number inputs before API save (max 2 decimals). */
export function formatQuantityField(value: string | number): string | null {
  const raw = String(value).trim()
  if (!raw) return null
  const parsed = Number.parseFloat(raw)
  if (!Number.isFinite(parsed) || parsed <= 0) return null
  return (Math.round(parsed * 100) / 100).toFixed(2)
}

export function formatUnitPriceField(value: string | number): string | null {
  const raw = String(value).trim()
  if (!raw) return null
  const parsed = Number.parseFloat(raw)
  if (!Number.isFinite(parsed) || parsed < 0) return null
  return (Math.round(parsed * 100) / 100).toFixed(2)
}

export function buildInvoiceLinePatchBody(
  line: Pick<DraftLine, 'lineType' | 'description' | 'quantity' | 'unitPrice' | 'catalogItemId'>,
  opts: { catalogItemId?: string | null } = {},
): Record<string, unknown> | null {
  const description = line.description.trim()
  if (!description) return null

  const body: Record<string, unknown> = {
    lineType: line.lineType,
    description,
  }

  const quantity = formatQuantityField(line.quantity)
  const unitPrice = formatUnitPriceField(line.unitPrice)
  if (quantity) body.quantity = quantity
  if (unitPrice !== null) body.unitPrice = unitPrice

  if (opts.catalogItemId !== undefined) body.catalogItemId = opts.catalogItemId
  else if (line.catalogItemId !== undefined) body.catalogItemId = line.catalogItemId ?? null

  return body
}

export function canProceedWizardStep(
  step: number,
  ctx: { customerId: string, vehicleId: string, lines: DraftLine[] },
): boolean {
  if (step === 1) return Boolean(ctx.customerId)
  if (step === 2) return Boolean(ctx.customerId)
  if (step === 3) return ctx.lines.some(isDraftLineValid)
  return true
}

/** Live line total while typing — matches server rounding. */
function coerceAmountField(value: string | number | null | undefined): string {
  if (value == null || value === '') return ''
  return String(value).trim()
}

export function previewLineAmount(
  quantity: string | number,
  unitPrice: string | number,
): string {
  try {
    const qty = coerceAmountField(quantity)
    const price = coerceAmountField(unitPrice)
    if (!qty || !price) return ''
    if (Number.parseFloat(qty) <= 0) return ''
    if (Number.parseFloat(price) < 0) return ''
    return multiplyMoney(qty, price)
  }
  catch {
    return ''
  }
}

export function previewLinesSubtotal(lines: DraftLine[]): string {
  const amounts = lines
    .filter(isDraftLineValid)
    .map(line => previewLineAmount(line.quantity, line.unitPrice))
    .filter(Boolean)
  if (!amounts.length) return '0.00'
  try {
    return addMoney(...amounts)
  }
  catch {
    return '0.00'
  }
}

export interface LineTypeBreakdown {
  parts: string
  labor: string
  fees: string
}

export interface LineForBreakdown {
  lineType: InvoiceLineType
  description: string
  quantity: string
  unitPrice: string
  lineAmount?: string
}

function lineAmountForBreakdown(line: LineForBreakdown): string {
  if (line.lineAmount?.trim()) return line.lineAmount
  if (!line.description.trim()) return ''
  const qty = coerceAmountField(line.quantity)
  const price = coerceAmountField(line.unitPrice)
  if (!qty || !price) return ''
  if (Number.parseFloat(qty) <= 0) return ''
  if (Number.parseFloat(price) < 0) return ''
  return previewLineAmount(qty, price)
}

/** Sum line amounts by parts, labor, and fees for summary breakdowns. */
export function previewLineTypeBreakdown(lines: LineForBreakdown[]): LineTypeBreakdown {
  const sumTypes = (types: InvoiceLineType[]) => {
    const amounts = lines
      .filter(line => types.includes(line.lineType))
      .map(lineAmountForBreakdown)
      .filter(Boolean)
    if (!amounts.length) return '0.00'
    try {
      return addMoney(...amounts)
    }
    catch {
      return '0.00'
    }
  }

  return {
    parts: sumTypes(['part']),
    labor: sumTypes(['labor']),
    fees: sumTypes(['fee']),
  }
}

export interface DraftTotalsPreview {
  subtotal: string
  taxAmount: string
  taxExempt: boolean
  feesAmount: string
  shopSuppliesPercent: string | null
  discountAmount: string
  total: string
}

/** Estimate invoice totals from draft lines before the first save. */
export function previewDraftTotals(
  lines: DraftLine[],
  opts: { taxExempt?: boolean } = {},
): DraftTotalsPreview {
  const subtotal = previewLinesSubtotal(lines)
  const taxExempt = opts.taxExempt ?? false
  return {
    subtotal,
    taxAmount: '0.00',
    taxExempt,
    feesAmount: '0',
    shopSuppliesPercent: null,
    discountAmount: '0',
    total: subtotal,
  }
}
