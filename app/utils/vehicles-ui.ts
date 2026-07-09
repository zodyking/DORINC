// Shared presentation helpers for vehicle rows (mockup: PAGE: VEHICLES).

export const UNIT_TYPE_LABELS: Record<string, string> = {
  truck: 'Truck',
  bus: 'Bus',
  equipment: 'Equipment',
  tractor: 'Tractor',
  other: 'Unit',
}

export function unitTypeLabel(key: string): string {
  return UNIT_TYPE_LABELS[key] ?? 'Unit'
}

export interface VehicleDisplay {
  unitType: string
  busNumber: string | null
  unitTag: string | null
  year: number | null
  make: string | null
  model: string | null
  trim: string | null
}

/** Lead line — mockup shows e.g. "Truck #HL-114". */
export function vehicleTag(v: VehicleDisplay): string {
  const type = unitTypeLabel(v.unitType)
  if (v.busNumber) return `${type} #${v.busNumber}`
  if (v.unitTag) return `${type} · ${v.unitTag}`
  const ymm = [v.year, v.make, v.model].filter(Boolean).join(' ')
  return ymm || 'Unregistered unit'
}

/** Sub line — mockup shows e.g. "2019 Freightliner Cascadia". */
export function vehicleSub(v: VehicleDisplay): string {
  return [v.year, v.make, v.model, v.trim].filter(Boolean).join(' ') || 'Year / make / model not set'
}

/** Odometer format — "412,806 mi" or "2,148.6 hrs" (mockup keeps hour tenths). */
export function odoDisplay(odometer: string | number | null, unit: string): string {
  if (odometer == null || odometer === '') return '—'
  const n = Number(odometer)
  if (Number.isNaN(n)) return '—'
  const digits = unit === 'hrs' && !Number.isInteger(n) ? 1 : 0
  return `${n.toLocaleString(undefined, { minimumFractionDigits: digits, maximumFractionDigits: digits })} ${unit}`
}

export function vehicleStatusPill(v: { status: string, archivedAt: string | null }): { cls: string, label: string } {
  if (v.archivedAt) return { cls: 'pill gray', label: 'Archived' }
  switch (v.status) {
    case 'active': return { cls: 'pill ok', label: 'Active' }
    case 'inactive': return { cls: 'pill warn', label: 'Inactive' }
    case 'retired': return { cls: 'pill gray', label: 'Retired' }
    default: return { cls: 'pill gray', label: v.status }
  }
}
