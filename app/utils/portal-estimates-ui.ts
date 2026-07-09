// Portal estimates presentation helpers (P3-03).

import { invoiceDateDisplay, moneyDisplay } from './invoices-ui'

export type PortalEstimateFilter = 'all' | 'pending' | 'approved' | 'rejected'

export function portalEstimateFilterLabel(filter: PortalEstimateFilter): string {
  switch (filter) {
    case 'pending': return 'Awaiting response'
    case 'approved': return 'Approved'
    case 'rejected': return 'Declined'
    default: return 'All'
  }
}

export function portalEstimateStatus(status: string): { cls: string, label: string } {
  switch (status) {
    case 'sent':
      return { cls: 'pill warn', label: 'Awaiting your response' }
    case 'approved':
      return { cls: 'pill ok', label: 'Approved' }
    case 'rejected':
      return { cls: 'pill gray', label: 'Declined' }
    case 'converted':
      return { cls: 'pill info', label: 'Converted to invoice' }
    default:
      return { cls: 'pill gray', label: status }
  }
}

export function portalEstimateMatchesFilter(status: string, filter: PortalEstimateFilter): boolean {
  if (filter === 'all') return true
  if (filter === 'pending') return status === 'sent'
  if (filter === 'approved') return status === 'approved' || status === 'converted'
  return status === 'rejected'
}

export function portalEstimateListSublabel(
  status: string,
  validUntil: string | null,
  estimateDate: string,
): string {
  if (status === 'sent' && validUntil) return `Valid until ${invoiceDateDisplay(validUntil)}`
  if (status === 'converted') return `Issued ${invoiceDateDisplay(estimateDate)}`
  return invoiceDateDisplay(estimateDate)
}

export { invoiceDateDisplay, moneyDisplay }
