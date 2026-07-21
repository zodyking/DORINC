// Invoice list/detail presentation helpers (mockup: PAGE: INVOICES / INVOICE DETAIL).

import type { LineItemType } from '#shared/line-item-types'
import { normalizeLineType } from '#shared/line-item-types'
import { formatAuditChangeMessage } from '#shared/audit-messages'
import { vehicleSub, unitTypeLabel, type VehicleDisplay } from './vehicles-ui'

export interface InvoiceVehicleSnapshotDisplay extends VehicleDisplay {
  vin?: string | null
  odometer?: string | null
  odometerUnit?: string
}

export type InvoiceStatus = 'draft' | 'pending_manager_approval' | 'sent' | 'paid' | 'void'

export const INVOICE_EMAIL_STATUSES: InvoiceStatus[] = ['draft', 'pending_manager_approval', 'sent', 'paid']
export const INVOICE_RESEND_STATUSES: InvoiceStatus[] = ['sent', 'paid']

export function isInvoiceEmailable(status: InvoiceStatus): boolean {
  return INVOICE_EMAIL_STATUSES.includes(status)
}

export function isInvoiceResend(status: InvoiceStatus): boolean {
  return INVOICE_RESEND_STATUSES.includes(status)
}

export const INVOICE_NON_EDITABLE_STATUSES: InvoiceStatus[] = ['paid', 'void']

export function isInvoiceEditable(status: InvoiceStatus): boolean {
  return !INVOICE_NON_EDITABLE_STATUSES.includes(status)
}
export type InvoiceLineType = LineItemType

export const PAYMENT_TERMS_LABELS: Record<string, string> = {
  due_on_receipt: 'Due on receipt',
  net_15: 'Net 15',
  net_30: 'Net 30',
  net_45: 'Net 45',
  net_60: 'Net 60',
}

/** Display money from API numeric strings — never compute invoice totals client-side. */
export function moneyDisplay(value: string | null | undefined, opts?: { signed?: boolean }): string {
  if (value == null || value === '') return '—'
  const num = Number.parseFloat(value)
  if (!Number.isFinite(num)) return value
  const formatted = new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
  }).format(Math.abs(num))
  if (opts?.signed && num < 0) return `−${formatted}`
  if (opts?.signed && num > 0 && value.startsWith('-')) return `−${formatted}`
  return formatted
}

export function paymentTermsLabel(terms: string | null | undefined): string {
  if (!terms) return '—'
  return PAYMENT_TERMS_LABELS[terms] ?? terms.replace(/_/g, ' ')
}

export function invoiceDateDisplay(isoDate: string | null | undefined): string {
  if (!isoDate) return '—'
  const d = new Date(`${isoDate}T12:00:00`)
  if (Number.isNaN(d.getTime())) return isoDate
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })
}

export function isInvoiceOverdue(
  status: InvoiceStatus,
  dueDate: string | null | undefined,
  balanceDue: string,
): boolean {
  if (status !== 'sent' || !dueDate) return false
  const today = new Date().toISOString().slice(0, 10)
  return dueDate < today && Number.parseFloat(balanceDue) > 0
}

export function invoiceStatusPill(
  status: InvoiceStatus,
  dueDate?: string | null,
  balanceDue?: string,
): { cls: string, label: string, hint?: string } {
  if (status === 'sent' && dueDate && balanceDue && isInvoiceOverdue(status, dueDate, balanceDue)) {
    return { cls: 'pill over', label: 'Overdue', hint: 'Past due date with open balance' }
  }
  switch (status) {
    case 'draft':
      return { cls: 'pill draft', label: 'Draft' }
    case 'pending_manager_approval':
      return { cls: 'pill warn', label: 'Pending approval', hint: 'Awaiting manager sign-off before send' }
    case 'sent':
      return { cls: 'pill sent', label: 'Sent', hint: 'Awaiting payment' }
    case 'paid':
      return { cls: 'pill paid', label: 'Paid' }
    case 'void':
      return { cls: 'pill gray', label: 'Void' }
    default:
      return { cls: 'pill gray', label: status }
  }
}

export function invoiceStatusHeadline(
  status: InvoiceStatus,
  dueDate?: string | null,
  balanceDue?: string,
): string {
  const pill = invoiceStatusPill(status, dueDate, balanceDue)
  if (pill.hint) return `${pill.label} · ${pill.hint}`
  return pill.label
}

export function lineTypeLabel(type: InvoiceLineType | string): string {
  switch (normalizeLineType(type)) {
    case 'part': return 'Part'
    case 'labor': return 'Labor'
    case 'fee': return 'Fee'
  }
}

export function lineTypePill(type: InvoiceLineType | string): string {
  switch (normalizeLineType(type)) {
    case 'part': return 'pill ok'
    case 'labor': return 'pill info'
    case 'fee': return 'pill gray'
  }
}

/** Qty column — mockup shows "2.0 hr", "1", or "—" for flat fees. */
export function lineQuantityDisplay(quantity: string, lineType: InvoiceLineType): string {
  const n = Number.parseFloat(quantity)
  if (!Number.isFinite(n)) return quantity
  if (lineType === 'labor') return `${n.toFixed(1)} hr`
  if (lineType === 'fee' && n === 1) return '—'
  return Number.isInteger(n) ? String(n) : n.toFixed(2)
}

export function vehicleSnapshotSub(snapshot: InvoiceVehicleSnapshotDisplay | null | undefined): string {
  if (!snapshot || typeof snapshot !== 'object') return 'No vehicle on invoice'
  try {
    const fleetNo = typeof snapshot.busNumber === 'string' ? snapshot.busNumber.trim() : ''
    if (fleetNo) {
      return `${unitTypeLabel(snapshot.unitType)} #${fleetNo}`
    }
    const ymm = vehicleSub(snapshot as VehicleDisplay)
    const vin = typeof snapshot.vin === 'string' ? snapshot.vin.trim() : ''
    return vin ? `${ymm} · ${vin}` : ymm
  }
  catch {
    return 'Vehicle details unavailable'
  }
}

export function formatInvoiceAuditAction(
  action: string,
  row: {
    changedFields?: string[] | null
    beforeData?: unknown
    afterData?: unknown
  } = {},
): string {
  return formatAuditChangeMessage({
    action,
    changedFields: row.changedFields ?? null,
    beforeData: row.beforeData,
    afterData: row.afterData,
  })
}

export function auditWhenDisplay(iso: string): string {
  const d = new Date(iso)
  return d.toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}
