export interface PortalLineItemCorrectionPayload {
  kind: 'line_item'
  lineItemId: string
  original: {
    description: string
    quantity: string
    unitPrice: string
  }
  proposed: {
    description: string
    quantity: string
    unitPrice: string
  }
  notes?: string | null
}

export interface PortalVehicleCorrectionFields {
  busNumber: string | null
  unitTag: string | null
  year: number | null
  make: string | null
  model: string | null
  vin: string | null
  plate: string | null
  odometer: string | null
  odometerUnit: string
}

export interface PortalVehicleCorrectionPayload {
  kind: 'vehicle'
  original: PortalVehicleCorrectionFields
  proposed: PortalVehicleCorrectionFields
  notes?: string | null
}

/** Legacy line payloads may omit kind — treat as line_item when lineItemId is present. */
export type PortalInvoiceCorrectionPayload
  = PortalLineItemCorrectionPayload
    | PortalVehicleCorrectionPayload
    | (Omit<PortalLineItemCorrectionPayload, 'kind'> & { kind?: undefined })

export function portalCorrectionPayloadKind(
  payload: PortalInvoiceCorrectionPayload,
): 'line_item' | 'vehicle' {
  if ('kind' in payload && payload.kind === 'vehicle') return 'vehicle'
  if ('lineItemId' in payload) return 'line_item'
  return 'vehicle'
}

function moneyDisplay(value: string): string {
  const n = Number.parseFloat(value)
  if (Number.isNaN(n)) return value
  return new Intl.NumberFormat(undefined, { style: 'currency', currency: 'USD' }).format(n)
}

function vehicleUnitLabel(fields: PortalVehicleCorrectionFields): string {
  if (fields.busNumber) return `#${fields.busNumber}`
  if (fields.unitTag) return fields.unitTag
  return '—'
}

function vehicleLine(fields: PortalVehicleCorrectionFields): string {
  const ymm = [fields.year, fields.make, fields.model].filter(Boolean).join(' ')
  const unit = vehicleUnitLabel(fields)
  return ymm ? `${unit} · ${ymm}` : unit
}

export function buildPortalLineItemCorrectionDescription(
  invoiceNumberFormatted: string,
  payload: PortalLineItemCorrectionPayload | Omit<PortalLineItemCorrectionPayload, 'kind'>,
): string {
  const { original, proposed, notes } = payload
  const lines = [
    `Invoice: ${invoiceNumberFormatted}`,
    'Line item correction request',
    '',
    'Current:',
    `  Description: ${original.description}`,
    `  Qty/Hours: ${original.quantity}`,
    `  Rate: ${moneyDisplay(original.unitPrice)}`,
    '',
    'Requested:',
    `  Description: ${proposed.description}`,
    `  Qty/Hours: ${proposed.quantity}`,
    `  Rate: ${moneyDisplay(proposed.unitPrice)}`,
  ]
  if (notes?.trim()) {
    lines.push('', `Notes: ${notes.trim()}`)
  }
  return lines.join('\n')
}

export function buildPortalVehicleCorrectionDescription(
  invoiceNumberFormatted: string,
  payload: PortalVehicleCorrectionPayload,
): string {
  const { original, proposed, notes } = payload
  const lines = [
    `Invoice: ${invoiceNumberFormatted}`,
    'Vehicle information correction (this invoice only)',
    '',
    'Current:',
    `  Unit: ${vehicleLine(original)}`,
    `  VIN: ${original.vin || '—'}`,
    `  Plate: ${original.plate || '—'}`,
    original.odometer ? `  Odometer: ${original.odometer} ${original.odometerUnit}` : null,
    '',
    'Requested:',
    `  Unit: ${vehicleLine(proposed)}`,
    `  VIN: ${proposed.vin || '—'}`,
    `  Plate: ${proposed.plate || '—'}`,
    proposed.odometer ? `  Odometer: ${proposed.odometer} ${proposed.odometerUnit}` : null,
  ].filter((part): part is string => Boolean(part))
  if (notes?.trim()) {
    lines.push('', `Notes: ${notes.trim()}`)
  }
  return lines.join('\n')
}

export function vehicleCorrectionFieldsToSnapshot(
  base: { unitType: string },
  fields: PortalVehicleCorrectionFields,
) {
  return {
    unitType: base.unitType,
    busNumber: fields.busNumber,
    unitTag: fields.unitTag,
    year: fields.year,
    make: fields.make,
    model: fields.model,
    vin: fields.vin,
    plate: fields.plate,
    odometer: fields.odometer,
    odometerUnit: fields.odometerUnit,
  }
}

export function vehicleUnitNumberFromFields(fields: PortalVehicleCorrectionFields): string {
  if (fields.busNumber) return fields.busNumber
  if (fields.unitTag) return fields.unitTag
  return ''
}

export interface PortalVehicleCorrectionApplyInput {
  unitNumber?: string | null
  year?: number | null
  make?: string | null
  model?: string | null
  vin?: string | null
  plate?: string | null
  odometer?: string | null
  odometerUnit?: string
}

export function vehicleCorrectionFieldsFromStaffApply(
  original: PortalVehicleCorrectionFields,
  input: PortalVehicleCorrectionApplyInput,
): PortalVehicleCorrectionFields {
  const unitNumber = input.unitNumber?.trim().replace(/^#/, '') || null
  const usesBusNumber = Boolean(original.busNumber) || (!original.unitTag && Boolean(unitNumber))
  return {
    busNumber: usesBusNumber ? unitNumber : null,
    unitTag: usesBusNumber ? null : unitNumber,
    year: input.year ?? original.year,
    make: input.make?.trim() || null,
    model: input.model?.trim() || null,
    vin: input.vin?.trim().toUpperCase() || null,
    plate: input.plate?.trim() || null,
    odometer: input.odometer?.trim() || null,
    odometerUnit: input.odometerUnit ?? original.odometerUnit ?? 'mi',
  }
}

export function describeStaffLineItemApplyAdjustments(
  payload: PortalLineItemCorrectionPayload,
  applied: { description: string, quantity: string, unitPrice: string },
): string[] {
  const lines: string[] = []
  if (applied.description !== payload.proposed.description) {
    lines.push(`Description: staff applied "${applied.description}" (customer requested "${payload.proposed.description}")`)
  }
  if (applied.quantity !== payload.proposed.quantity) {
    lines.push(`Qty/hrs: staff applied ${applied.quantity} (customer requested ${payload.proposed.quantity})`)
  }
  if (applied.unitPrice !== payload.proposed.unitPrice) {
    lines.push(`Rate: staff applied ${moneyDisplay(applied.unitPrice)} (customer requested ${moneyDisplay(payload.proposed.unitPrice)})`)
  }
  return lines
}

export function describeStaffVehicleApplyAdjustments(
  payload: PortalVehicleCorrectionPayload,
  applied: PortalVehicleCorrectionFields,
): string[] {
  const checks: { label: string, before: string, requested: string, finalValue: string }[] = [
    {
      label: 'Unit',
      before: vehicleLine(payload.original),
      requested: vehicleLine(payload.proposed),
      finalValue: vehicleLine(applied),
    },
    {
      label: 'VIN',
      before: payload.original.vin || '—',
      requested: payload.proposed.vin || '—',
      finalValue: applied.vin || '—',
    },
    {
      label: 'Plate',
      before: payload.original.plate || '—',
      requested: payload.proposed.plate || '—',
      finalValue: applied.plate || '—',
    },
    {
      label: 'Odometer',
      before: payload.original.odometer ? `${payload.original.odometer} ${payload.original.odometerUnit}` : '—',
      requested: payload.proposed.odometer ? `${payload.proposed.odometer} ${payload.proposed.odometerUnit}` : '—',
      finalValue: applied.odometer ? `${applied.odometer} ${applied.odometerUnit}` : '—',
    },
  ]

  return checks
    .filter(row => row.before !== row.requested && row.finalValue !== row.requested)
    .map(row => `${row.label}: staff applied ${row.finalValue} (customer requested ${row.requested}, current ${row.before})`)
}
