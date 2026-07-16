// Staff portal request review queue helpers (mockup: Review queue / P2-09).

import type { PortalRequestReviewKind } from '#shared/validators/portal-request-review'
import {
  portalCorrectionPayloadKind,
  type PortalInvoiceCorrectionPayload,
  type PortalVehicleCorrectionFields,
} from '#shared/portal-invoice-correction'
import { portalRequestKindLabel, portalRequestStatusPill } from './portal-requests-ui'

export type StaffRequestTab = 'all' | PortalRequestReviewKind

export const STAFF_REQUEST_TABS: { key: StaffRequestTab, label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'service', label: 'Service' },
  { key: 'invoice_change', label: 'Billing' },
  { key: 'vehicle_change', label: 'Vehicle' },
  { key: 'new_vehicle', label: 'New vehicle' },
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

export function staffRequestKindLabel(kind: string): string {
  if (kind === 'invoice_change') return 'Billing'
  if (kind === 'new_vehicle') return 'New vehicle'
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
    default:
      return 'Approve'
  }
}

export function staffRequestApproveHint(row: StaffRequestActionRow): string {
  switch (staffRequestActionType(row)) {
    case 'service_draft':
      return 'Opens a draft invoice pre-filled from the customer request.'
    case 'line_correction':
      return 'Creates a revision draft and applies the requested line item changes.'
    case 'vehicle_correction':
      return 'Creates a revision draft with the updated vehicle snapshot for this invoice only.'
    case 'billing_inquiry':
      return row.invoiceId
        ? 'Closes the request without changing the invoice. Reply to the customer separately if needed.'
        : 'Marks the billing question resolved. No invoice changes are made.'
    case 'vehicle_note':
      return 'Adds the correction note to the live vehicle record for staff follow-up.'
    case 'add_vehicle':
      return 'Creates the official fleet vehicle from the customer submission.'
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
