// Staff portal request review queue helpers (mockup: Review queue / P2-09).

import type { PortalRequestReviewKind } from '#shared/validators/portal-request-review'
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

export function staffRequestApproveLabel(kind: string): string {
  if (kind === 'service') return 'Create draft invoice'
  if (kind === 'invoice_change') return 'Approve & revise'
  if (kind === 'vehicle_change') return 'Approve correction'
  if (kind === 'new_vehicle') return 'Add vehicle'
  return 'Approve'
}

export function staffRequestApproveHint(kind: string): string {
  if (kind === 'service') return 'Creates a draft invoice pre-filled from the customer request.'
  if (kind === 'invoice_change') return 'Creates an invoice revision when an invoice is linked; general billing inquiries are marked resolved.'
  if (kind === 'vehicle_change') return 'Appends the correction note to the vehicle record for staff follow-up.'
  if (kind === 'new_vehicle') return 'Creates the official fleet vehicle from the customer submission.'
  return 'Marks the request resolved.'
}
