import type { AccountType } from '../../shared/permissions/keys'

export function isExternalAuditor(accountType: AccountType | string | undefined): boolean {
  return accountType === 'external_auditor'
}

/** Strip internal-only invoice fields for external auditor read access (P3-12). */
export function redactInvoiceForAuditor<T extends Record<string, unknown>>(invoice: T): T {
  return {
    ...invoice,
    internalNotes: null,
    complaint: null,
  }
}

/** Strip internal customer fields for external auditor read access. */
export function redactCustomerForAuditor<T extends Record<string, unknown>>(customer: T): T {
  const next = { ...customer }
  if ('internalNotes' in next) next.internalNotes = null
  if ('notes' in next) next.notes = null
  return next
}
