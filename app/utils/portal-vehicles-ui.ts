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

export { unitTypeLabel }
