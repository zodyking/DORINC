/** Vehicle unit labels for chat links, PDFs, and pickers. */

export const UNIT_TYPE_LABELS: Record<string, string> = {
  truck: 'Truck',
  bus: 'Bus',
  equipment: 'Equipment',
  tractor: 'Tractor',
  other: 'Unit',
}

export function unitTypeLabel(unitType: string | null | undefined): string {
  return UNIT_TYPE_LABELS[String(unitType || 'other')] ?? 'Unit'
}

export interface VehicleUnitParts {
  unitType?: string | null
  busNumber?: string | null
  unitTag?: string | null
}

/** Primary chat/picker label, e.g. "Bus #2" or "Truck #HL-114". */
export function formatVehicleUnitLabel(parts: VehicleUnitParts): string {
  const type = unitTypeLabel(parts.unitType)
  const number = parts.unitTag?.trim() || parts.busNumber?.trim()
  if (number) return `${type} #${number}`
  return type
}

/** Lowercase search blob for a vehicle row + customer name. */
export function vehicleUnitSearchText(
  parts: VehicleUnitParts & {
    customerName?: string | null
    make?: string | null
    model?: string | null
    vin?: string | null
  },
): string {
  return [
    formatVehicleUnitLabel(parts),
    parts.customerName,
    parts.busNumber,
    parts.unitTag,
    parts.make,
    parts.model,
    parts.vin,
    parts.unitType,
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase()
}

/** Split a picker query into lowercase tokens (supports "customer unit" style search). */
export function splitEntitySearchTokens(q?: string): string[] {
  return String(q ?? '')
    .trim()
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean)
}
