// Invoice creator wizard helpers (mockup: PAGE: INVOICE CREATOR / P1-23).

import { addMoney, rateOfMoney, subtractMoney } from '#shared/money'
import { computeWaivedTaxAmount, taxableSubtotalFromLines } from '#shared/invoice-tax-exempt'
import {
  formatPercentOffField,
  resolveInvoiceDiscount,
  resolveLineDiscount,
} from '#shared/invoice-discount'
import type { InvoiceLineType } from './invoices-ui'

export type InvoiceWizardStepKey =
  | 'customer'
  | 'vehicle'
  | 'service_log'
  | 'dates'
  | 'lines'
  | 'review'

export interface InvoiceWizardStepDef {
  n: number
  key: InvoiceWizardStepKey
  label: string
}

/** Build wizard steps. When AI service-log extraction is on, insert Service log after Vehicle. */
export function buildInvoiceWizardSteps(includeServiceLog = false): InvoiceWizardStepDef[] {
  const defs: Array<{ key: InvoiceWizardStepKey, label: string }> = [
    { key: 'customer', label: 'Customer' },
    { key: 'vehicle', label: 'Vehicle' },
  ]
  if (includeServiceLog) {
    defs.push({ key: 'service_log', label: 'Service log' })
  }
  defs.push(
    { key: 'dates', label: 'Dates & terms' },
    { key: 'lines', label: 'Line items' },
    { key: 'review', label: 'Review' },
  )
  return defs.map((d, i) => ({ n: i + 1, key: d.key, label: d.label }))
}

/** Default 5-step list (when service-log upload is not offered). */
export const INVOICE_WIZARD_STEPS = buildInvoiceWizardSteps(false)

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
  discountAmount?: string | null
  discountPercent?: string | null
  taxable?: boolean
}

/** Compute due date from issue date + payment terms (display default only — API stores explicit dueDate). */
export function dueDateFromTerms(invoiceDate: string, terms: string): string {
  const base = new Date(`${invoiceDate}T12:00:00`)
  if (Number.isNaN(base.getTime())) return invoiceDate
  const add = TERMS_DAYS[terms] ?? 30
  base.setDate(base.getDate() + add)
  return base.toISOString().slice(0, 10)
}

export function wizardStateLabel(step: number, includeServiceLog = false): string {
  const steps = buildInvoiceWizardSteps(includeServiceLog)
  const s = steps.find(x => x.n === step)
  return `Step ${step} of ${steps.length} — ${s?.label ?? ''}`
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
    discountAmount: '0',
    discountPercent: null,
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
  line: Pick<DraftLine, 'lineType' | 'description' | 'quantity' | 'unitPrice' | 'catalogItemId' | 'discountAmount' | 'discountPercent'>,
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

  const discountAmount = formatUnitPriceField(line.discountAmount ?? '0') ?? '0.00'
  body.discountAmount = discountAmount
  body.discountPercent = formatPercentOffField(line.discountPercent)

  if (opts.catalogItemId !== undefined) body.catalogItemId = opts.catalogItemId
  else if (line.catalogItemId !== undefined) body.catalogItemId = line.catalogItemId ?? null

  return body
}

export function canProceedWizardStep(
  step: number,
  ctx: { customerId: string, vehicleId: string, lines: DraftLine[] },
  opts: { includeServiceLog?: boolean } = {},
): boolean {
  const def = buildInvoiceWizardSteps(opts.includeServiceLog ?? false).find(s => s.n === step)
  if (!def) return true
  if (def.key === 'lines') return ctx.lines.some(isDraftLineValid)
  if (def.key === 'review') return true
  return Boolean(ctx.customerId)
}

/** Live line total while typing — matches server rounding. */
function coerceAmountField(value: string | number | null | undefined): string {
  if (value == null || value === '') return ''
  return String(value).trim()
}

export function previewLineAmount(
  quantity: string | number,
  unitPrice: string | number,
  discount?: Pick<DraftLine, 'discountAmount' | 'discountPercent'> | null,
): string {
  try {
    const qty = coerceAmountField(quantity)
    const price = coerceAmountField(unitPrice)
    if (!qty || !price) return ''
    if (Number.parseFloat(qty) <= 0) return ''
    if (Number.parseFloat(price) < 0) return ''
    return resolveLineDiscount({
      quantity: qty,
      unitPrice: price,
      discountAmount: discount?.discountAmount,
      discountPercent: discount?.discountPercent,
    }).lineAmount
  }
  catch {
    return ''
  }
}

export function previewLineGrossAmount(
  quantity: string | number,
  unitPrice: string | number,
): string {
  return previewLineAmount(quantity, unitPrice)
}

export function previewLinesSubtotal(lines: DraftLine[]): string {
  const amounts = lines
    .filter(isDraftLineValid)
    .map(line => previewLineAmount(line.quantity, line.unitPrice, line))
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
  discountAmount?: string | null
  discountPercent?: string | null
}

function lineAmountForBreakdown(line: LineForBreakdown): string {
  if (!line.description.trim() && !line.lineAmount?.trim()) return ''
  const qty = coerceAmountField(line.quantity)
  const price = coerceAmountField(line.unitPrice)
  if (qty && price && Number.parseFloat(qty) > 0 && Number.parseFloat(price) >= 0) {
    const live = previewLineAmount(qty, price, line)
    if (live) return live
  }
  return line.lineAmount?.trim() || ''
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
  waivedTaxAmount: string | null
  taxExempt: boolean
  feesAmount: string
  discountAmount: string
  total: string
}

/** Estimate invoice totals from draft lines before the first save. */
export function previewDraftTotals(
  lines: DraftLine[],
  opts: {
    taxExempt?: boolean
    taxRate?: string
    discountAmount?: string
    discountPercent?: string | null
  } = {},
): DraftTotalsPreview {
  const subtotal = previewLinesSubtotal(lines)
  const taxExempt = opts.taxExempt ?? false
  const taxRate = opts.taxRate ?? '0'
  const validLines = lines.filter(isDraftLineValid)
  const taxableSubtotal = taxableSubtotalFromLines(validLines)
  const waivedTaxAmount = computeWaivedTaxAmount({ taxExempt, taxRate, taxableSubtotal })
  const taxAmount = taxExempt ? '0' : rateOfMoney(taxableSubtotal, taxRate)
  const feesAmount = '0'
  const discountAmount = resolveInvoiceDiscount({
    subtotal,
    taxAmount,
    feesAmount,
    discountAmount: opts.discountAmount,
    discountPercent: opts.discountPercent,
  })
  const total = subtractMoney(addMoney(subtotal, feesAmount, taxAmount), discountAmount)
  return {
    subtotal,
    taxAmount,
    waivedTaxAmount,
    taxExempt,
    feesAmount,
    discountAmount,
    total,
  }
}
