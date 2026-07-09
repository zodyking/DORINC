import type { DeletionEntityType } from '~/server/db/schema/deletion-requests'

export const DELETION_ENTITY_TABS: { key: 'all' | DeletionEntityType, label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'customer', label: 'Customers' },
  { key: 'vehicle', label: 'Vehicles' },
  { key: 'service_log', label: 'Service logs' },
  { key: 'invoice', label: 'Invoices' },
]

export function deletionEntityLabel(type: DeletionEntityType): string {
  switch (type) {
    case 'customer': return 'Customer'
    case 'vehicle': return 'Vehicle'
    case 'service_log': return 'Service log'
    case 'invoice': return 'Invoice'
  }
}

export function deletionStatusPill(status: string): { cls: string, label: string } {
  switch (status) {
    case 'pending': return { cls: 'pill warn', label: 'Pending' }
    case 'approved': return { cls: 'pill ok', label: 'Approved' }
    case 'rejected': return { cls: 'pill bad', label: 'Rejected' }
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
