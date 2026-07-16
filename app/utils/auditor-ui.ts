// External auditor presentation helpers (P3-12).

export function auditorAccessBanner(): string {
  return 'Read-only auditor access — internal notes and operational tools are hidden.'
}

export function auditorInvoiceSub(status: string): string {
  if (status === 'sent') return 'Outstanding'
  if (status === 'paid') return 'Settled'
  if (status === 'draft') return 'Draft — send when ready'
  return status.replace(/_/g, ' ')
}
