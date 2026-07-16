// Portal invoices presentation helpers (mockup: Portal Invoices / P2-05).

import { invoiceDateDisplay, moneyDisplay } from './invoices-ui'
import { portalInvoiceStatus } from './portal-dashboard-ui'

export type PortalInvoiceFilter = 'all' | 'open' | 'paid'

export type PortalInvoiceSort =
  | 'newest'
  | 'oldest'
  | 'amount_high'
  | 'amount_low'
  | 'vehicle'

export interface PortalInvoiceListRow {
  id: string
  invoiceNumberFormatted: string
  status: string
  invoiceDate: string
  dueDate: string | null
  total: string
  balanceDue: string
  vehicleId: string | null
  vehicleLabel: string
}

export interface PortalInvoiceListFilters {
  q: string
  status: PortalInvoiceFilter
  sort: PortalInvoiceSort
  vehicleId: string
  dateFrom: string
  dateTo: string
  amountMin: string
  amountMax: string
}

export function portalInvoiceDefaultListFilters(): PortalInvoiceListFilters {
  return {
    q: '',
    status: 'all',
    sort: 'newest',
    vehicleId: 'all',
    dateFrom: '',
    dateTo: '',
    amountMin: '',
    amountMax: '',
  }
}

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

export function portalInvoiceListFiltersDirty(filters: PortalInvoiceListFilters): boolean {
  const defaults = portalInvoiceDefaultListFilters()
  return filters.q.trim() !== defaults.q
    || filters.status !== defaults.status
    || filters.sort !== defaults.sort
    || filters.vehicleId !== defaults.vehicleId
    || filters.dateFrom !== defaults.dateFrom
    || filters.dateTo !== defaults.dateTo
    || filters.amountMin.trim() !== defaults.amountMin
    || filters.amountMax.trim() !== defaults.amountMax
}

export function portalInvoiceVehicleOptions(items: PortalInvoiceListRow[]): Array<{ id: string, label: string }> {
  const map = new Map<string, string>()
  for (const inv of items) {
    if (inv.vehicleId && inv.vehicleLabel && inv.vehicleLabel !== '—') {
      map.set(inv.vehicleId, inv.vehicleLabel)
    }
  }
  return [...map.entries()]
    .map(([id, label]) => ({ id, label }))
    .sort((a, b) => a.label.localeCompare(b.label))
}

export function portalInvoiceApplyListFilters(
  items: PortalInvoiceListRow[],
  filters: PortalInvoiceListFilters,
): PortalInvoiceListRow[] {
  const needle = filters.q.trim().toLowerCase()
  let rows = items.filter(inv =>
    portalInvoiceMatchesFilter(inv.status, inv.balanceDue, filters.status),
  )

  if (filters.vehicleId !== 'all') {
    rows = rows.filter(inv => inv.vehicleId === filters.vehicleId)
  }

  if (filters.dateFrom) {
    rows = rows.filter(inv => inv.invoiceDate >= filters.dateFrom)
  }
  if (filters.dateTo) {
    rows = rows.filter(inv => inv.invoiceDate <= filters.dateTo)
  }

  const min = filters.amountMin.trim() ? Number.parseFloat(filters.amountMin) : null
  const max = filters.amountMax.trim() ? Number.parseFloat(filters.amountMax) : null
  if (min != null && Number.isFinite(min)) {
    rows = rows.filter(inv => Number.parseFloat(inv.total) >= min)
  }
  if (max != null && Number.isFinite(max)) {
    rows = rows.filter(inv => Number.parseFloat(inv.total) <= max)
  }

  if (needle) {
    rows = rows.filter(inv =>
      inv.invoiceNumberFormatted.toLowerCase().includes(needle)
      || inv.vehicleLabel.toLowerCase().includes(needle),
    )
  }

  const sorted = [...rows]
  sorted.sort((a, b) => {
    if (filters.sort === 'vehicle') return a.vehicleLabel.localeCompare(b.vehicleLabel)
    if (filters.sort === 'oldest') return a.invoiceDate.localeCompare(b.invoiceDate)
    if (filters.sort === 'amount_high') return Number.parseFloat(b.total) - Number.parseFloat(a.total)
    if (filters.sort === 'amount_low') return Number.parseFloat(a.total) - Number.parseFloat(b.total)
    return b.invoiceDate.localeCompare(a.invoiceDate)
  })
  return sorted
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

export function portalInvoiceLineCorrectionTopic(): string {
  return 'Line item correction'
}

export function portalInvoiceVehicleCorrectionTopic(): string {
  return 'Vehicle information correction'
}

export interface PortalVehicleCorrectionForm {
  unitNumber: string
  year: string
  make: string
  model: string
  vin: string
  plate: string
  odometer: string
  notes: string
}

export function portalVehicleUnitNumberInput(vehicle: {
  busNumber?: string | null
  unitTag?: string | null
} | null): string {
  if (!vehicle) return ''
  if (vehicle.busNumber) return vehicle.busNumber
  if (vehicle.unitTag) return vehicle.unitTag
  return ''
}

export function portalInvoiceVehicleCorrectionFormFromVehicle(vehicle: {
  busNumber?: string | null
  unitTag?: string | null
  year?: number | null
  make?: string | null
  model?: string | null
  vin?: string | null
  plate?: string | null
  odometer?: string | null
} | null): PortalVehicleCorrectionForm {
  return {
    unitNumber: portalVehicleUnitNumberInput(vehicle),
    year: vehicle?.year != null ? String(vehicle.year) : '',
    make: vehicle?.make ?? '',
    model: vehicle?.model ?? '',
    vin: vehicle?.vin ?? '',
    plate: vehicle?.plate ?? '',
    odometer: vehicle?.odometer ?? '',
    notes: '',
  }
}

export function portalInvoiceVehicleCorrectionHasChanges(
  original: {
    busNumber?: string | null
    unitTag?: string | null
    year?: number | null
    make?: string | null
    model?: string | null
    vin?: string | null
    plate?: string | null
    odometer?: string | null
  } | null,
  form: PortalVehicleCorrectionForm,
): boolean {
  if (!original) return false
  const origUnit = portalVehicleUnitNumberInput(original)
  return origUnit !== form.unitNumber.trim()
    || String(original.year ?? '') !== form.year.trim()
    || (original.make ?? '') !== form.make.trim()
    || (original.model ?? '') !== form.model.trim()
    || (original.vin ?? '') !== form.vin.trim()
    || (original.plate ?? '') !== form.plate.trim()
    || (original.odometer ?? '') !== form.odometer.trim()
}

export interface PortalLineItemCorrectionForm {
  description: string
  quantity: string
  unitPrice: string
  notes: string
}

export function portalInvoiceLineCorrectionFormFromLine(line: {
  description: string
  quantity: string
  unitPrice: string
}): PortalLineItemCorrectionForm {
  return {
    description: line.description,
    quantity: line.quantity,
    unitPrice: line.unitPrice,
    notes: '',
  }
}

export function portalInvoiceLineCorrectionHasChanges(
  original: { description: string, quantity: string, unitPrice: string },
  form: Pick<PortalLineItemCorrectionForm, 'description' | 'quantity' | 'unitPrice'>,
): boolean {
  return original.description.trim() !== form.description.trim()
    || original.quantity !== form.quantity
    || original.unitPrice !== form.unitPrice
}

export function portalInvoiceLineCorrectionDescription(
  invoiceNumberFormatted: string,
  line: { description: string, quantity: string, lineAmount: string, unitPrice?: string },
  customerMessage: string,
): string {
  return [
    `Invoice: ${invoiceNumberFormatted}`,
    `Line item: ${line.description}`,
    `Qty: ${line.quantity}`,
    line.unitPrice ? `Rate: ${moneyDisplay(line.unitPrice)}` : null,
    `Amount: ${moneyDisplay(line.lineAmount)}`,
    '',
    customerMessage.trim(),
  ].filter((part): part is string => Boolean(part)).join('\n')
}
