import type { DeletionEntityType } from '~/server/db/schema/deletion-requests'

export const DELETION_ENTITY_TABS: { key: 'all' | DeletionEntityType, label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'customer', label: 'Customers' },
  { key: 'vehicle', label: 'Vehicles' },
  { key: 'service_log', label: 'Service logs' },
  { key: 'invoice', label: 'Invoices' },
  { key: 'conversation', label: 'Conversations' },
]

export interface DeletionRequestRowView {
  entityType: DeletionEntityType
  entityLabel: string
  reason: string
  submittedByName?: string | null
  submittedByEmail?: string | null
}

export function deletionEntityLabel(type: DeletionEntityType): string {
  switch (type) {
    case 'customer': return 'Customer'
    case 'vehicle': return 'Vehicle'
    case 'service_log': return 'Service log'
    case 'invoice': return 'Invoice'
    case 'conversation': return 'Conversation'
  }
}

export function deletionPreservationNote(type: DeletionEntityType): string {
  switch (type) {
    case 'customer':
      return 'The customer account is permanently removed. Related invoices, service logs, and vehicles keep their full customer information.'
    case 'vehicle':
      return 'The unit is permanently removed. Related invoices and service logs keep their full unit information.'
    case 'service_log':
      return 'The service log is permanently removed. Linked invoices keep their line items and customer/vehicle details.'
    case 'invoice':
      return 'The invoice is permanently removed. This cannot be undone.'
    case 'conversation':
      return 'Direct message, email, and team chat threads can be cleared after approval. Team chat stays available; other conversations are permanently removed.'
    default:
      return 'Related records keep their full information after this record is removed.'
  }
}

export function deletionRequestTypeBadge(entityType: DeletionEntityType): { cls: string, label: string } {
  return { cls: 'pill info', label: deletionEntityLabel(entityType) }
}

export function deletionRequestSubmitter(name: string | null, email: string | null): string {
  if (name?.trim() && email?.trim()) return `${name.trim()} · ${email.trim()}`
  return name?.trim() || email?.trim() || 'Staff'
}

export function deletionRequestPreviewText(reason: string): string {
  return reason?.trim() || '—'
}

export function deletionRequestApproveLabel(entityType: DeletionEntityType): string {
  switch (entityType) {
    case 'customer': return 'Confirm delete customer'
    case 'vehicle': return 'Confirm delete vehicle'
    case 'service_log': return 'Confirm delete service log'
    case 'invoice': return 'Confirm delete invoice'
    case 'conversation': return 'Confirm delete conversation'
    default: return 'Confirm deletion'
  }
}

export function deletionRequestApproveHint(entityType: DeletionEntityType): string {
  return deletionPreservationNote(entityType)
}

export function deletionRequestOutcomeSummary(entityType: DeletionEntityType): string {
  switch (entityType) {
    case 'customer':
      return 'Outcome: customer permanently removed; related invoices and logs keep frozen snapshots'
    case 'vehicle':
      return 'Outcome: vehicle permanently removed; related invoices and logs keep frozen unit details'
    case 'service_log':
      return 'Outcome: service log permanently removed; linked invoices keep line items and customer/vehicle details'
    case 'invoice':
      return 'Outcome: invoice permanently removed'
    case 'conversation':
      return 'Outcome: message history cleared; team chat channel remains, other threads are permanently removed'
    default:
      return 'Outcome: record permanently removed'
  }
}

export function deletionStatusPill(status: string): { cls: string, label: string } {
  switch (status) {
    case 'pending': return { cls: 'pill warn', label: 'Under review' }
    case 'approved': return { cls: 'pill ok', label: 'Approved' }
    case 'rejected': return { cls: 'pill gray', label: 'Declined' }
    default: return { cls: 'pill gray', label: status }
  }
}

export function deletionWhen(iso: string): string {
  return new Date(iso).toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}
