/** Human-facing account-type labels used in email signatures and attributions. */

/**
 * Map an internal account-type key to the label shown under a staff signature.
 * Admins and super admins are both presented to customers as "Administrator"
 * so the internal hierarchy is never leaked outside the company.
 */
export function signatureAccountTypeLabel(accountTypeKey: string | null | undefined): string {
  switch ((accountTypeKey ?? '').trim().toLowerCase()) {
    case 'super_admin':
    case 'admin':
      return 'Administrator'
    case 'manager':
      return 'Manager'
    case 'accountant':
      return 'Accountant'
    case 'mechanic':
      return 'Mechanic'
    case 'viewer':
      return 'Viewer'
    case 'external_auditor':
      return 'External Auditor'
    case 'customer':
      return 'Customer'
    default:
      return 'Team Member'
  }
}
