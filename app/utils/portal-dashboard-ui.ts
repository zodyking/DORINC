// Portal dashboard presentation helpers (mockup: Portal Dashboard / P2-04).

import { moneyDisplay, invoiceStatusPill } from './invoices-ui'
import type { InvoiceStatus } from './invoices-ui'

export function portalOpenBalanceSub(count: number): string {
  return `${count} unpaid invoice${count === 1 ? '' : 's'}`
}

export function portalVehicleSub(count: number): string {
  return count === 1 ? 'Active fleet unit' : 'Active fleet units'
}

export function portalPendingRequestsSub(count: number): string {
  return count === 1 ? 'Awaiting shop review' : 'Awaiting shop review'
}

export function portalMoney(value: string | null | undefined): string {
  return moneyDisplay(value)
}

/** Show invoice total when paid; otherwise balance due. */
export function portalRecentInvoiceAmount(
  status: string,
  total: string,
  balanceDue: string,
): string {
  const due = Number.parseFloat(balanceDue || '0')
  if (status === 'paid' || due <= 0) return portalMoney(total)
  return portalMoney(balanceDue)
}

export function portalInvoiceStatus(
  status: string,
  dueDate?: string | null,
  balanceDue?: string,
): { cls: string, label: string } {
  const pill = invoiceStatusPill(status as InvoiceStatus, dueDate, balanceDue)
  if (status === 'sent' && balanceDue && Number.parseFloat(balanceDue) > 0) {
    return { cls: 'pill info', label: 'Awaiting payment' }
  }
  return { cls: pill.cls, label: pill.label }
}

export function portalUserInitials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean)
  if (!parts.length) return 'CU'
  if (parts.length === 1) return parts[0]!.slice(0, 2).toUpperCase()
  return `${parts[0]![0]}${parts[parts.length - 1]![0]}`.toUpperCase()
}
