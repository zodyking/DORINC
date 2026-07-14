// Shared presentation helpers for user rows/pills (mockup: PAGE: USERS).

export const ACCOUNT_TYPE_LABELS: Record<string, string> = {
  super_admin: 'Super Admin',
  admin: 'Admin',
  manager: 'Manager',
  accountant: 'Accountant',
  mechanic: 'Mechanic',
  viewer: 'Viewer',
  external_auditor: 'External Auditor',
  customer: 'Customer',
}

export function accountTypeLabel(key: string): string {
  return ACCOUNT_TYPE_LABELS[key] ?? key
}

export function accountTypePill(key: string): string {
  switch (key) {
    case 'super_admin':
    case 'admin':
      return 'pill indigo'
    case 'manager':
    case 'accountant':
      return 'pill warn'
    case 'mechanic':
      return 'pill info'
    default:
      return 'pill gray'
  }
}

export function statusPill(status: string): string {
  switch (status) {
    case 'active': return 'pill ok'
    case 'pending': return 'pill warn'
    case 'rejected': return 'pill over'
    case 'suspended': return 'pill over'
    default: return 'pill gray'
  }
}

export function statusLabel(status: string): string {
  switch (status) {
    case 'active': return 'Active'
    case 'pending': return 'Pending'
    case 'rejected': return 'Rejected'
    case 'suspended': return 'Suspended'
    case 'disabled': return 'Inactive'
    default: return status
  }
}

export function initials(name: string): string {
  const parts = name.trim().split(/\s+/)
  const first = parts[0]?.[0] ?? '?'
  const last = parts.length > 1 ? parts[parts.length - 1]![0] : (parts[0]?.[1] ?? '')
  return (first + (last ?? '')).toUpperCase()
}

const AV_COLORS = ['indigo', 'amber', 'teal', 'slate', 'rose'] as const

export function avColor(name: string): string {
  let hash = 0
  for (const ch of name) hash = (hash * 31 + ch.charCodeAt(0)) >>> 0
  return AV_COLORS[hash % AV_COLORS.length]!
}
