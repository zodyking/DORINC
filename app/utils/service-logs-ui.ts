// Presentation helpers for service logs (mockup: PAGE: SERVICE LOGS / DETAIL).

import { vehicleSub, vehicleTag, type VehicleDisplay } from './vehicles-ui'

export type ServiceLogStatus
  = 'uploaded' | 'ocr_processing' | 'ai_processing' | 'ready_for_review' | 'in_review'
    | 'needs_info' | 'approved_for_invoice' | 'converted_to_invoice' | 'rejected' | 'archived'

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

export function serviceLogStatusPill(status: ServiceLogStatus): { cls: string, label: string } {
  switch (status) {
    case 'uploaded':
      return { cls: 'pill gray', label: 'Uploaded' }
    case 'ocr_processing':
      return { cls: 'pill info', label: 'OCR processing' }
    case 'ai_processing':
      return { cls: 'pill info', label: 'AI processing' }
    case 'ready_for_review':
    case 'in_review':
      return { cls: 'pill warn', label: 'Awaiting review' }
    case 'needs_info':
      return { cls: 'pill warn', label: 'Needs info' }
    case 'approved_for_invoice':
      return { cls: 'pill ok', label: 'Approved for invoice' }
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

export function formatAuditAction(action: string): string {
  if (action === 'service_logs.create') return 'Log created'
  if (action === 'service_logs.update') return 'Log updated'
  if (action.startsWith('service_logs.status.')) {
    const status = action.replace('service_logs.status.', '')
    return `Status → ${serviceLogStatusPill(status as ServiceLogStatus).label}`
  }
  return action.replace(/\./g, ' ')
}
