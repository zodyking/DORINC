// Portal vehicles presentation helpers (mockup: Portal Vehicles / P2-06).

import { invoiceDateDisplay } from './invoices-ui'
import { unitTypeLabel } from './vehicles-ui'

export const PORTAL_VEHICLE_TYPE_OPTIONS = [
  { value: 'tractor', label: 'Tractor' },
  { value: 'truck', label: 'Trailer / box truck' },
  { value: 'equipment', label: 'Loader / equipment' },
  { value: 'bus', label: 'Bus' },
  { value: 'other', label: 'Other' },
] as const

export type PortalVehicleType = typeof PORTAL_VEHICLE_TYPE_OPTIONS[number]['value']

export function portalVehicleLastService(isoDate: string | null | undefined): string {
  if (!isoDate) return '—'
  return invoiceDateDisplay(isoDate)
}

export function portalVehicleCountLabel(count: number): string {
  return count === 1 ? '1 unit' : `${count} units`
}

/** Strip spaces and uppercase — max 17 chars for VIN entry. */
export function normalizePortalVin(value: string): string {
  return value.replace(/\s/g, '').toUpperCase().slice(0, 17)
}

export function portalVinLooksComplete(vin: string): boolean {
  return normalizePortalVin(vin).length === 17
}

export function formatPortalDecodedVehicle(
  year: string | number | null | undefined,
  make: string | null | undefined,
  model: string | null | undefined,
): string {
  const parts = [
    year ? String(year) : '',
    make?.trim() ?? '',
    model?.trim() ?? '',
  ].filter(Boolean)
  return parts.length ? parts.join(' ') : '—'
}

export { unitTypeLabel }
