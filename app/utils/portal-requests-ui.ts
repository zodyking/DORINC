// Portal requests presentation helpers (mockup: Portal Requests / P2-07).

export type PortalRequestTab = 'service' | 'billing' | 'general'
export type PortalRequestHistoryFilter = 'all' | 'open' | 'resolved'
export type PortalRequestKindFilter = 'all' | 'service' | 'billing' | 'general' | 'vehicle'
export type PortalRequestSort = 'newest' | 'oldest' | 'type' | 'vehicle'

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

export interface PortalRequestListRow {
  id: string
  kind: string
  title: string
  meta: string
  status: string
  statusLabel: string
  createdAt: string
  isOpen: boolean
  vehicleId: string | null
  vehicleLabel: string | null
  invoiceId: string | null
  invoiceNumberFormatted: string | null
}

export interface PortalRequestListFilters {
  q: string
  status: PortalRequestHistoryFilter
  kind: PortalRequestKindFilter
  vehicleId: string
  invoiceId: string
  dateFrom: string
  dateTo: string
  sort: PortalRequestSort
}

export function portalRequestDefaultListFilters(): PortalRequestListFilters {
  return {
    q: '',
    status: 'open',
    kind: 'all',
    vehicleId: 'all',
    invoiceId: 'all',
    dateFrom: '',
    dateTo: '',
    sort: 'newest',
  }
}

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

export function portalRequestKindFilterLabel(kind: PortalRequestKindFilter): string {
  if (kind === 'all') return 'All types'
  if (kind === 'vehicle') return 'Vehicle updates'
  return portalRequestKindLabel(kind === 'general' ? 'general' : kind)
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

export function portalRequestMatchesKindFilter(kind: string, filter: PortalRequestKindFilter): boolean {
  if (filter === 'all') return true
  if (filter === 'vehicle') return kind === 'vehicle_change' || kind === 'vehicle_add'
  return kind === filter
}

export function portalRequestVehicleOptions(items: PortalRequestListRow[]): Array<{ id: string, label: string }> {
  const map = new Map<string, string>()
  for (const item of items) {
    if (item.vehicleId && item.vehicleLabel) {
      map.set(item.vehicleId, item.vehicleLabel)
    }
  }
  return [...map.entries()]
    .map(([id, label]) => ({ id, label }))
    .sort((a, b) => a.label.localeCompare(b.label))
}

export function portalRequestInvoiceOptions(items: PortalRequestListRow[]): Array<{ id: string, label: string }> {
  const map = new Map<string, string>()
  for (const item of items) {
    if (item.invoiceId && item.invoiceNumberFormatted) {
      map.set(item.invoiceId, item.invoiceNumberFormatted)
    }
  }
  return [...map.entries()]
    .map(([id, label]) => ({ id, label }))
    .sort((a, b) => a.label.localeCompare(b.label))
}

export function portalRequestApplyListFilters(
  items: PortalRequestListRow[],
  filters: PortalRequestListFilters,
): PortalRequestListRow[] {
  const needle = filters.q.trim().toLowerCase()
  let rows = items.filter(item => portalRequestMatchesFilter(item, filters.status))
  rows = rows.filter(item => portalRequestMatchesKindFilter(item.kind, filters.kind))

  if (filters.vehicleId !== 'all') {
    rows = rows.filter(item => item.vehicleId === filters.vehicleId)
  }
  if (filters.invoiceId !== 'all') {
    rows = rows.filter(item => item.invoiceId === filters.invoiceId)
  }
  if (filters.dateFrom) {
    rows = rows.filter(item => item.createdAt.slice(0, 10) >= filters.dateFrom)
  }
  if (filters.dateTo) {
    rows = rows.filter(item => item.createdAt.slice(0, 10) <= filters.dateTo)
  }
  if (needle) {
    rows = rows.filter(item =>
      item.title.toLowerCase().includes(needle)
      || item.meta.toLowerCase().includes(needle)
      || portalRequestKindLabel(item.kind).toLowerCase().includes(needle)
      || (item.vehicleLabel?.toLowerCase().includes(needle) ?? false)
      || (item.invoiceNumberFormatted?.toLowerCase().includes(needle) ?? false),
    )
  }

  const sorted = [...rows]
  sorted.sort((a, b) => {
    if (filters.sort === 'type') {
      const byKind = portalRequestKindLabel(a.kind).localeCompare(portalRequestKindLabel(b.kind))
      if (byKind !== 0) return byKind
      return b.createdAt.localeCompare(a.createdAt)
    }
    if (filters.sort === 'vehicle') {
      const byVeh = (a.vehicleLabel ?? 'zzz').localeCompare(b.vehicleLabel ?? 'zzz')
      if (byVeh !== 0) return byVeh
      return b.createdAt.localeCompare(a.createdAt)
    }
    if (filters.sort === 'oldest') return a.createdAt.localeCompare(b.createdAt)
    return b.createdAt.localeCompare(a.createdAt)
  })
  return sorted
}

export function portalRequestListFiltersDirty(filters: PortalRequestListFilters): boolean {
  const defaults = portalRequestDefaultListFilters()
  return filters.q.trim() !== defaults.q
    || filters.status !== defaults.status
    || filters.kind !== defaults.kind
    || filters.vehicleId !== defaults.vehicleId
    || filters.invoiceId !== defaults.invoiceId
    || filters.dateFrom !== defaults.dateFrom
    || filters.dateTo !== defaults.dateTo
    || filters.sort !== defaults.sort
}

export function portalRequestDetailPath(kind: string, id: string): string {
  return `/portal/requests/${kind}/${id}`
}

export function portalRequestUrgencyLabel(value: string): string {
  return PORTAL_SERVICE_URGENCIES.find(opt => opt.value === value)?.label ?? value
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
