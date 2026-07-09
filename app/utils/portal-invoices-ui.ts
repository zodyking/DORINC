// Portal invoices presentation helpers (mockup: Portal Invoices / P2-05).

import { invoiceDateDisplay, moneyDisplay } from './invoices-ui'
import { portalInvoiceStatus } from './portal-dashboard-ui'

export type PortalInvoiceFilter = 'all' | 'open' | 'paid'

export function portalInvoiceFilterLabel(filter: PortalInvoiceFilter): string {
  switch (filter) {
    case 'open': return 'Open'
    case 'paid': return 'Paid'
    default: return 'All'
  }
}

export function portalInvoiceIsOpen(status: string, balanceDue: string): boolean {
  return (status === 'sent' || status === 'approved') && Number.parseFloat(balanceDue) > 0
}

export function portalInvoiceMatchesFilter(
  status: string,
  balanceDue: string,
  filter: PortalInvoiceFilter,
): boolean {
  if (filter === 'all') return true
  if (filter === 'paid') return status === 'paid'
  return portalInvoiceIsOpen(status, balanceDue)
}

export function portalInvoiceListSublabel(
  status: string,
  dueDate: string | null,
  invoiceDate: string,
): string {
  if (status === 'paid') return `Paid · ${invoiceDateDisplay(invoiceDate)}`
  if (dueDate) return `Due ${invoiceDateDisplay(dueDate)}`
  return invoiceDateDisplay(invoiceDate)
}

export function portalInvoiceDetailStatus(
  status: string,
  dueDate: string | null,
  balanceDue: string,
): { cls: string, label: string } {
  const pill = portalInvoiceStatus(status, dueDate, balanceDue)
  if (portalInvoiceIsOpen(status, balanceDue)) {
    return { cls: pill.cls, label: `Open · ${moneyDisplay(balanceDue)} due` }
  }
  return pill
}

export function portalInvoicePdfUrl(invoiceId: string): string {
  return `/api/portal/invoices/${invoiceId}/pdf`
}

export { portalInvoiceStatus }
