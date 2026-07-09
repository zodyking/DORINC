// Invoice creator wizard helpers (mockup: PAGE: INVOICE CREATOR / P1-23).

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
  { value: 'service', label: 'Service' },
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
  }
}

export function isDraftLineValid(line: DraftLine): boolean {
  return line.description.trim().length > 0
    && Number.parseFloat(line.quantity) > 0
    && Number.parseFloat(line.unitPrice) >= 0
}

export function canProceedWizardStep(
  step: number,
  ctx: { customerId: string, vehicleId: string, lines: DraftLine[] },
): boolean {
  if (step === 1) return Boolean(ctx.customerId)
  if (step === 2) return Boolean(ctx.customerId && ctx.vehicleId)
  if (step === 3) return ctx.lines.some(isDraftLineValid)
  return true
}
