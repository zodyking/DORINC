// Staff portal request review queue helpers (mockup: Review queue / P2-09).

import type { PortalRequestReviewKind } from '#shared/validators/portal-request-review'
import {
  portalCorrectionPayloadKind,
  type PortalInvoiceCorrectionPayload,
  type PortalVehicleCorrectionFields,
  type PortalVehicleCorrectionPayload,
} from '#shared/portal-invoice-correction'
import { portalRequestKindLabel, portalRequestStatusPill } from './portal-requests-ui'

export type StaffRequestTab = 'all' | PortalRequestReviewKind

export const STAFF_REQUEST_TABS: { key: StaffRequestTab, label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'service', label: 'Service' },
  { key: 'invoice_change', label: 'Billing' },
  { key: 'vehicle_change', label: 'Vehicle' },
  { key: 'new_vehicle', label: 'New vehicle' },
  { key: 'document', label: 'Documents' },
  { key: 'general', label: 'General' },
]

export interface StaffRequestActionRow {
  kind: string
  title?: string
  summary?: string
  detail?: string | null
  invoiceId?: string | null
  invoiceNumberFormatted?: string | null
  correctionPayload?: PortalInvoiceCorrectionPayload | null
}

export type StaffRequestActionType
  = | 'service_draft'
    | 'line_correction'
    | 'vehicle_correction'
    | 'billing_inquiry'
    | 'vehicle_note'
    | 'add_vehicle'
    | 'general_resolve'
    | 'document_change'

export function staffRequestKindLabel(kind: string): string {
  if (kind === 'invoice_change') return 'Billing'
  if (kind === 'new_vehicle') return 'New vehicle'
  if (kind === 'document') return 'Document'
  return portalRequestKindLabel(kind)
}

export function staffRequestStatusPill(status: string) {
  return portalRequestStatusPill(status)
}

export function staffRequestUrgencyPill(urgency: string | null): { cls: string, label: string } | null {
  if (!urgency || urgency === 'normal') return null
  if (urgency === 'urgent') return { cls: 'pill bad', label: 'Urgent' }
  if (urgency === 'soon') return { cls: 'pill warn', label: 'Soon' }
  return { cls: 'pill gray', label: urgency }
}

export function staffRequestWhen(iso: string): string {
  return new Date(iso).toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  })
}

export function staffRequestSubmitter(name: string | null, email: string | null): string {
  if (name?.trim() && email?.trim()) return `${name.trim()} · ${email.trim()}`
  return name?.trim() || email?.trim() || 'Portal user'
}

export function staffRequestActionType(row: StaffRequestActionRow): StaffRequestActionType {
  if (row.kind === 'service') return 'service_draft'
  if (row.kind === 'vehicle_change') return 'vehicle_note'
  if (row.kind === 'new_vehicle') return 'add_vehicle'
  if (row.kind === 'general') return 'general_resolve'
  if (row.kind === 'document') return 'document_change'
  if (row.kind === 'invoice_change') {
    if (row.correctionPayload) {
      return portalCorrectionPayloadKind(row.correctionPayload) === 'vehicle'
        ? 'vehicle_correction'
        : 'line_correction'
    }
    return 'billing_inquiry'
  }
  return 'general_resolve'
}

export function staffRequestTypeBadge(row: StaffRequestActionRow): { cls: string, label: string } {
  switch (staffRequestActionType(row)) {
    case 'service_draft':
      return { cls: 'pill info', label: 'Service request' }
    case 'line_correction':
      return { cls: 'pill info', label: 'Line item correction' }
    case 'vehicle_correction':
      return { cls: 'pill info', label: 'Invoice vehicle correction' }
    case 'billing_inquiry':
      return { cls: 'pill gray', label: row.invoiceId ? 'Billing inquiry' : 'Billing question' }
    case 'vehicle_note':
      return { cls: 'pill info', label: 'Vehicle update' }
    case 'add_vehicle':
      return { cls: 'pill info', label: 'New vehicle' }
    default:
      return { cls: 'pill gray', label: 'General message' }
  }
}

export function staffRequestApproveLabel(row: StaffRequestActionRow): string {
  switch (staffRequestActionType(row)) {
    case 'service_draft':
      return 'Create draft invoice'
    case 'line_correction':
    case 'vehicle_correction':
      return 'Apply to invoice'
    case 'billing_inquiry':
    case 'general_resolve':
      return 'Mark resolved'
    case 'vehicle_note':
      return 'Approve correction'
    case 'add_vehicle':
      return 'Add vehicle'
    case 'document_change':
      return 'Apply document change'
    default:
      return 'Approve'
  }
}

export function staffRequestApproveHint(row: StaffRequestActionRow): string {
  switch (staffRequestActionType(row)) {
    case 'service_draft':
      return 'Opens a draft invoice pre-filled from the customer request.'
    case 'line_correction':
      return 'Creates a revision draft. Choose what to apply per field — keep current, accept requested, or enter a custom value.'
    case 'vehicle_correction':
      return 'Creates a revision draft. Adjust any field before applying — you can partially accept or override the customer request.'
    case 'billing_inquiry':
      return row.invoiceId
        ? 'Closes the request without changing the invoice. Reply to the customer separately if needed.'
        : 'Marks the billing question resolved. No invoice changes are made.'
    case 'vehicle_note':
      return 'Adds the correction note to the live vehicle record for staff follow-up.'
    case 'add_vehicle':
      return 'Creates the official fleet vehicle from the customer submission.'
    case 'document_change':
      return 'Applies the customer\'s requested document update or removal to the official record.'
    default:
      return 'Marks the message resolved. No other records are changed.'
  }
}

export function staffRequestOutcomeSummary(row: StaffRequestActionRow): string {
  switch (staffRequestActionType(row)) {
    case 'service_draft':
      return 'Outcome: new draft invoice'
    case 'line_correction':
    case 'vehicle_correction':
      return `Outcome: revision draft${row.invoiceNumberFormatted ? ` from ${row.invoiceNumberFormatted}` : ''}`
    case 'billing_inquiry':
      return row.invoiceId ? 'Outcome: request closed (invoice unchanged)' : 'Outcome: request closed'
    case 'vehicle_note':
      return 'Outcome: vehicle notes updated'
    case 'add_vehicle':
      return 'Outcome: new vehicle record'
    case 'document_change':
      return 'Outcome: document updated or removed'
    default:
      return 'Outcome: request closed'
  }
}

export function staffRequestPreviewText(row: StaffRequestActionRow): string {
  if (row.correctionPayload) {
    const kind = portalCorrectionPayloadKind(row.correctionPayload)
    if (kind === 'line_item') {
      const { original, proposed } = row.correctionPayload as Extract<typeof row.correctionPayload, { lineItemId: string }>
      const parts: string[] = []
      if (original.description !== proposed.description) parts.push(`Description → ${proposed.description}`)
      if (original.quantity !== proposed.quantity) parts.push(`Qty/hrs → ${proposed.quantity}`)
      if (original.unitPrice !== proposed.unitPrice) parts.push(`Rate → ${staffMoney(proposed.unitPrice)}`)
      return parts.length ? parts.join(' · ') : 'Line item correction (review changes below)'
    }
    if ('kind' in row.correctionPayload && row.correctionPayload.kind === 'vehicle') {
      const changed = staffVehicleCorrectionDiff(row.correctionPayload)
      if (changed.length) {
        return changed.map(field => `${field.label} → ${field.after}`).join(' · ')
      }
    }
    return 'Vehicle snapshot correction (review changes below)'
  }
  return row.summary?.trim() || row.detail?.trim() || '—'
}

export function staffMoney(value: string): string {
  const n = Number.parseFloat(value)
  if (Number.isNaN(n)) return value
  return new Intl.NumberFormat(undefined, { style: 'currency', currency: 'USD' }).format(n)
}

export interface StaffCorrectionFieldDiff {
  label: string
  before: string
  after: string
}

function vehicleUnitLabel(fields: PortalVehicleCorrectionFields): string {
  if (fields.busNumber) return `#${fields.busNumber}`
  if (fields.unitTag) return fields.unitTag
  return '—'
}

function vehicleSummary(fields: PortalVehicleCorrectionFields): string {
  const ymm = [fields.year, fields.make, fields.model].filter(Boolean).join(' ')
  const unit = vehicleUnitLabel(fields)
  return ymm ? `${unit} · ${ymm}` : unit
}

function vehicleFieldValue(label: string, fields: PortalVehicleCorrectionFields): string {
  switch (label) {
    case 'Unit':
      return vehicleSummary(fields)
    case 'VIN':
      return fields.vin?.trim() || '—'
    case 'Plate':
      return fields.plate?.trim() || '—'
    case 'Odometer':
      return fields.odometer?.trim()
        ? `${fields.odometer} ${fields.odometerUnit}`
        : '—'
    default:
      return '—'
  }
}

export function staffVehicleCorrectionDiff(
  payload: Extract<PortalInvoiceCorrectionPayload, { kind: 'vehicle' }>,
): StaffCorrectionFieldDiff[] {
  const labels = ['Unit', 'VIN', 'Plate', 'Odometer'] as const
  return labels
    .map((label) => {
      const before = vehicleFieldValue(label, payload.original)
      const after = vehicleFieldValue(label, payload.proposed)
      return before !== after ? { label, before, after } : null
    })
    .filter((row): row is StaffCorrectionFieldDiff => row !== null)
}

export function staffCorrectionPayloadKind(
  payload: PortalInvoiceCorrectionPayload | null | undefined,
): 'line_item' | 'vehicle' | null {
  if (!payload) return null
  return portalCorrectionPayloadKind(payload)
}

export interface StaffCorrectionApplyField {
  key: string
  label: string
  original: string
  proposed: string
  apply: string
  inputType: 'text' | 'number' | 'money'
  changed: boolean
}

export interface StaffCorrectionApplySummary {
  keptCount: number
  acceptedCount: number
  customCount: number
  label: string
}

function defaultApplyValue(original: string, proposed: string): string {
  return original === proposed ? original : proposed
}

export function staffLineItemApplyFields(
  payload: Extract<PortalInvoiceCorrectionPayload, { lineItemId: string }>,
): StaffCorrectionApplyField[] {
  const { original, proposed } = payload
  const rows: Omit<StaffCorrectionApplyField, 'changed'>[] = [
    {
      key: 'description',
      label: 'Description',
      original: original.description,
      proposed: proposed.description,
      apply: defaultApplyValue(original.description, proposed.description),
      inputType: 'text',
    },
    {
      key: 'quantity',
      label: 'Qty / hrs',
      original: original.quantity,
      proposed: proposed.quantity,
      apply: defaultApplyValue(original.quantity, proposed.quantity),
      inputType: 'number',
    },
    {
      key: 'unitPrice',
      label: 'Rate',
      original: staffMoney(original.unitPrice),
      proposed: staffMoney(proposed.unitPrice),
      apply: defaultApplyValue(original.unitPrice, proposed.unitPrice),
      inputType: 'money',
    },
  ]

  return rows.map(row => ({
    ...row,
    changed: row.original !== row.proposed,
  }))
}

export function staffVehicleApplyFields(payload: PortalVehicleCorrectionPayload): StaffCorrectionApplyField[] {
  const { original, proposed } = payload
  const rows: Omit<StaffCorrectionApplyField, 'changed'>[] = [
    {
      key: 'unitNumber',
      label: 'Unit #',
      original: vehicleUnitNumberFromFields(original),
      proposed: vehicleUnitNumberFromFields(proposed),
      apply: defaultApplyValue(vehicleUnitNumberFromFields(original), vehicleUnitNumberFromFields(proposed)),
      inputType: 'text',
    },
    {
      key: 'year',
      label: 'Year',
      original: original.year != null ? String(original.year) : '',
      proposed: proposed.year != null ? String(proposed.year) : '',
      apply: defaultApplyValue(
        original.year != null ? String(original.year) : '',
        proposed.year != null ? String(proposed.year) : '',
      ),
      inputType: 'number',
    },
    {
      key: 'make',
      label: 'Make',
      original: original.make ?? '',
      proposed: proposed.make ?? '',
      apply: defaultApplyValue(original.make ?? '', proposed.make ?? ''),
      inputType: 'text',
    },
    {
      key: 'model',
      label: 'Model',
      original: original.model ?? '',
      proposed: proposed.model ?? '',
      apply: defaultApplyValue(original.model ?? '', proposed.model ?? ''),
      inputType: 'text',
    },
    {
      key: 'vin',
      label: 'VIN',
      original: original.vin ?? '',
      proposed: proposed.vin ?? '',
      apply: defaultApplyValue(original.vin ?? '', proposed.vin ?? ''),
      inputType: 'text',
    },
    {
      key: 'plate',
      label: 'Plate',
      original: original.plate ?? '',
      proposed: proposed.plate ?? '',
      apply: defaultApplyValue(original.plate ?? '', proposed.plate ?? ''),
      inputType: 'text',
    },
    {
      key: 'odometer',
      label: 'Odometer',
      original: original.odometer ?? '',
      proposed: proposed.odometer ?? '',
      apply: defaultApplyValue(original.odometer ?? '', proposed.odometer ?? ''),
      inputType: 'number',
    },
  ]

  return rows.map(row => ({
    ...row,
    changed: row.original !== row.proposed,
  }))
}

function normalizeApplyFieldValue(field: StaffCorrectionApplyField): string {
  return field.inputType === 'money'
    ? field.apply.trim().replace(/^\$/, '')
    : field.apply.trim()
}

function rawApplyFieldValue(field: StaffCorrectionApplyField): string {
  if (field.key === 'unitPrice') return normalizeApplyFieldValue(field)
  if (field.key === 'quantity' || field.key === 'odometer' || field.key === 'year') {
    return normalizeApplyFieldValue(field)
  }
  return field.apply.trim()
}

export function staffCorrectionApplySummary(fields: StaffCorrectionApplyField[]): StaffCorrectionApplySummary {
  let keptCount = 0
  let acceptedCount = 0
  let customCount = 0

  for (const field of fields) {
    const apply = rawApplyFieldValue(field)
    const original = field.key === 'unitPrice'
      ? field.original.replace(/^\$/, '')
      : field.original
    const proposed = field.key === 'unitPrice'
      ? field.proposed.replace(/^\$/, '')
      : field.proposed

    if (apply === original) keptCount++
    else if (apply === proposed) acceptedCount++
    else customCount++
  }

  const parts: string[] = []
  if (acceptedCount) parts.push(`${acceptedCount} accepted`)
  if (keptCount) parts.push(`${keptCount} kept`)
  if (customCount) parts.push(`${customCount} custom`)

  return {
    keptCount,
    acceptedCount,
    customCount,
    label: parts.length ? parts.join(' · ') : 'No changes selected',
  }
}

export function staffValidateCorrectionApplyFields(fields: StaffCorrectionApplyField[]): string | null {
  for (const field of fields) {
    const value = rawApplyFieldValue(field)
    if (field.key === 'description' && !value) return 'Description is required.'
    if ((field.key === 'quantity' || field.key === 'unitPrice') && value && !/^\d+(\.\d{1,2})?$/.test(value)) {
      return `${field.label} must be a valid number.`
    }
    if (field.key === 'year' && value && !/^\d{4}$/.test(value)) return 'Year must be four digits.'
  }
  return null
}

export function staffBuildLineItemCorrectionApply(
  fields: StaffCorrectionApplyField[],
): { kind: 'line_item', description: string, quantity: string, unitPrice: string } {
  const byKey = Object.fromEntries(fields.map(field => [field.key, rawApplyFieldValue(field)]))
  return {
    kind: 'line_item',
    description: byKey.description ?? '',
    quantity: byKey.quantity ?? '0',
    unitPrice: byKey.unitPrice ?? '0',
  }
}

export function staffBuildVehicleCorrectionApply(
  payload: PortalVehicleCorrectionPayload,
  fields: StaffCorrectionApplyField[],
): {
  kind: 'vehicle'
  unitNumber: string | null
  year: number | null
  make: string | null
  model: string | null
  vin: string | null
  plate: string | null
  odometer: string | null
  odometerUnit: string
} {
  const byKey = Object.fromEntries(fields.map(field => [field.key, rawApplyFieldValue(field)]))
  return {
    kind: 'vehicle',
    unitNumber: byKey.unitNumber || null,
    year: byKey.year ? Number.parseInt(byKey.year, 10) : payload.original.year,
    make: byKey.make || null,
    model: byKey.model || null,
    vin: byKey.vin || null,
    plate: byKey.plate || null,
    odometer: byKey.odometer || null,
    odometerUnit: payload.original.odometerUnit ?? 'mi',
  }
}

function vehicleUnitNumberFromFields(fields: PortalVehicleCorrectionFields): string {
  if (fields.busNumber) return fields.busNumber
  if (fields.unitTag) return fields.unitTag
  return ''
}
