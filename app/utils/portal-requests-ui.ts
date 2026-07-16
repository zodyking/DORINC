// Portal requests presentation helpers (mockup: Portal Requests / P2-07).

export type PortalRequestTab = 'service' | 'billing' | 'general'
export type PortalRequestHistoryFilter = 'all' | 'open' | 'resolved'

export const PORTAL_SERVICE_CATEGORIES = [
  'Preventive maintenance',
  'Repair / breakdown',
  'Diagnostic / check engine',
  'Tires / brakes',
  'Body / electrical',
  'Other',
] as const

export const PORTAL_SERVICE_URGENCIES = [
  { value: 'normal', label: 'Normal — schedule when available' },
  { value: 'soon', label: 'Soon — within a few days' },
  { value: 'urgent', label: 'Urgent — unit down / safety issue' },
] as const

export const PORTAL_BILLING_TOPICS = [
  'Payment or balance question',
  'Line item clarification',
  'Duplicate or incorrect charge',
  'Request credit / adjustment',
  'Payment plan / terms',
  'Other billing matter',
] as const

export function portalRequestKindLabel(kind: string): string {
  const labels: Record<string, string> = {
    service: 'Service',
    billing: 'Billing',
    vehicle_change: 'Vehicle',
    vehicle_add: 'Vehicle',
    general: 'General',
  }
  return labels[kind] ?? 'Request'
}

export function portalRequestStatusPill(status: string): { cls: string, label: string } {
  if (status === 'pending') return { cls: 'pill warn', label: 'Under review' }
  if (status === 'approved') return { cls: 'pill ok', label: 'Resolved' }
  if (status === 'rejected') return { cls: 'pill gray', label: 'Closed' }
  return { cls: 'pill gray', label: status }
}

export function portalRequestMatchesFilter(
  item: { status: string, isOpen: boolean },
  filter: PortalRequestHistoryFilter,
): boolean {
  if (filter === 'all') return true
  if (filter === 'open') return item.isOpen
  return !item.isOpen
}

export function portalRequestHistoryFilterLabel(filter: PortalRequestHistoryFilter): string {
  if (filter === 'open') return 'Open requests'
  if (filter === 'resolved') return 'Resolved'
  return 'All requests'
}

export function portalTodayIso(): string {
  return new Date().toISOString().slice(0, 10)
}

export function portalInvoiceOptionLabel(
  invoiceNumberFormatted: string,
  vehicleLabel: string,
  balanceDue: string,
  status: string,
): string {
  const paid = status === 'paid' || Number.parseFloat(balanceDue) <= 0
  const balance = paid ? 'Paid' : `$${Number.parseFloat(balanceDue).toFixed(2)} open`
  return `${invoiceNumberFormatted} — ${vehicleLabel} · ${balance}`
}
