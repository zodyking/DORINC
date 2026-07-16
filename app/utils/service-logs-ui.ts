// Presentation helpers for service logs (mockup: PAGE: SERVICE LOGS / DETAIL).

import { formatAuditChangeMessage } from '#shared/audit-messages'
import { vehicleSub, vehicleTag, type VehicleDisplay } from './vehicles-ui'

export type ServiceLogStatus
  = 'draft' | 'uploaded' | 'ocr_processing' | 'ai_processing' | 'ready_for_review' | 'in_review'
    | 'needs_info' | 'converted_to_invoice' | 'rejected' | 'archived'

export { CUSTOMER_REQUESTED_SERVICE_NOTE } from '#shared/portal-service-log'

export const WORK_TYPE_LABELS: Record<string, string> = {
  preventive_maintenance: 'Preventive maintenance',
  repair: 'Repair / breakdown',
  diagnostic: 'Diagnostic',
  inspection: 'Inspection',
  other: 'Other',
}

export function logNumberDisplay(logNumber: number): string {
  return `SL-${logNumber}`
}

export function workTypeLabel(key: string): string {
  return WORK_TYPE_LABELS[key] ?? key
}

export const INVOICE_LINK_RELEASED_REASON = 'Linked invoice was deleted; ready to send to invoice again'

export function serviceLogInvoiceLinkReleased(statusReason: string | null | undefined): boolean {
  return statusReason === INVOICE_LINK_RELEASED_REASON
}

export const SERVICE_LOG_SENDABLE_STATUSES: ServiceLogStatus[] = ['ready_for_review', 'in_review']

export function isServiceLogSendable(status: ServiceLogStatus): boolean {
  return SERVICE_LOG_SENDABLE_STATUSES.includes(status)
}

export const CUSTOMER_REQUESTED_TRIAGE_STATUSES: ServiceLogStatus[] = ['draft', 'uploaded']

export function serviceLogStatusPill(status: ServiceLogStatus, opts?: { invoiceId?: string | null }): { cls: string, label: string } {
  if (status === 'converted_to_invoice' && !opts?.invoiceId) {
    return { cls: 'pill warn', label: 'Awaiting review' }
  }
  switch (status) {
    case 'draft':
      return { cls: 'pill gray', label: 'Draft' }
    case 'uploaded':
      return { cls: 'pill gray', label: 'Uploaded' }
    case 'ocr_processing':
      return { cls: 'pill info', label: 'OCR processing' }
    case 'ai_processing':
      return { cls: 'pill info', label: 'AI processing' }
    case 'ready_for_review':
      return { cls: 'pill warn', label: 'Ready to invoice' }
    case 'in_review':
      return { cls: 'pill warn', label: 'Ready to invoice' }
    case 'needs_info':
      return { cls: 'pill warn', label: 'Needs info' }
    case 'converted_to_invoice':
      return { cls: 'pill ok', label: 'Invoiced' }
    case 'rejected':
      return { cls: 'pill over', label: 'Rejected' }
    case 'archived':
      return { cls: 'pill gray', label: 'Archived' }
    default:
      return { cls: 'pill gray', label: status }
  }
}

export function logTitle(logNumber: number, vehicle: VehicleDisplay, workType: string): string {
  return `${logNumberDisplay(logNumber)} — ${vehicleTag(vehicle)} · ${workTypeLabel(workType)}`
}

export function serviceLogServiceDateDisplay(isoDate: string | null | undefined): string {
  if (!isoDate) return '—'
  const d = new Date(`${isoDate}T12:00:00`)
  if (Number.isNaN(d.getTime())) return isoDate
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })
}

export function logSubtitle(
  customerName: string,
  createdAt: string,
  submitterName: string,
  fileCount: number,
): string {
  const when = new Date(createdAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
  const photos = fileCount === 1 ? '1 photo' : `${fileCount} photos`
  return `${customerName} · uploaded ${when} by ${submitterName} · ${photos}`
}

export function vehicleLine(vehicle: VehicleDisplay): string {
  return `${vehicleTag(vehicle)} · ${vehicleSub(vehicle)}`
}

export function fileThumbEmoji(mimeType: string, fileKind: string): string {
  if (mimeType.startsWith('image/')) return '🖼'
  if (mimeType === 'application/pdf' || fileKind === 'pdf') return '📄'
  return '📎'
}

export function revertInvoiceBlockLabel(reason: string | null | undefined): string | null {
  switch (reason) {
    case 'EDIT_SESSION_ACTIVE':
      return 'An accountant is editing this invoice — undo is not available.'
    case 'INVOICE_MODIFIED':
      return 'The invoice draft has been saved with changes — undo is not available.'
    case 'HAS_LINE_ITEMS':
      return 'The invoice has line items — undo is not available.'
    case 'INVOICE_SENT':
      return 'This invoice has already been sent — undo is not available.'
    default:
      return null
  }
}

export function formatAuditAction(
  action: string,
  row: {
    changedFields?: string[] | null
    beforeData?: unknown
    afterData?: unknown
  } = {},
): string {
  if (action.startsWith('service_logs.status.')) {
    const status = action.replace('service_logs.status.', '')
    return `Changed status to ${serviceLogStatusPill(status as ServiceLogStatus).label}`
  }
  return formatAuditChangeMessage({
    action,
    changedFields: row.changedFields ?? null,
    beforeData: row.beforeData,
    afterData: row.afterData,
  })
}
