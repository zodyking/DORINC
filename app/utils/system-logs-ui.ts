// System logs (audit) list presentation helpers (mockup: PAGE: SYSTEM LOGS).

import { auditWhenDisplay } from './invoices-ui'

export type AuditCategory = 'all' | 'settings' | 'users' | 'backups' | 'security'

export interface AuditLogRow {
  id: string
  entityType: string
  entityId: string | null
  action: string
  actorUserId: string | null
  actorName: string | null
  actorEmail: string | null
  actorAccountType: string | null
  changedFields: unknown
  afterData: unknown
  beforeData: unknown
  riskLevel: string
  ipAddress: string | null
  requestId: string | null
  createdAt: string
}

export const AUDIT_CATEGORY_CHIPS: { key: AuditCategory, label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'settings', label: 'Settings' },
  { key: 'users', label: 'Users & roles' },
  { key: 'backups', label: 'Backups' },
  { key: 'security', label: 'Security' },
]

const ENTITY_LABELS: Record<string, string> = {
  customer: 'Customer',
  vehicle: 'Vehicle',
  invoice: 'Invoice',
  service_log: 'Service log',
  catalog: 'Catalog',
  file: 'File',
  user: 'User',
  auth: 'Auth',
  backup: 'Backup',
  setup: 'Setup',
  flags: 'Settings',
  editing_session: 'Editing session',
  invoice_template: 'Invoice template',
  test: 'Test',
}

export function entityTypeLabel(entityType: string): string {
  return ENTITY_LABELS[entityType] ?? entityType.replace(/_/g, ' ')
}

export function auditActorDisplay(name: string | null | undefined, email?: string | null): string {
  if (name?.trim()) return name.trim()
  if (email?.trim()) return email.trim()
  return 'system'
}

export function auditActionLabel(action: string): string {
  const known: Record<string, string> = {
    'customers.create': 'Customer created',
    'customers.update': 'Customer updated',
    'customers.archive': 'Customer archived',
    'customers.restore': 'Customer restored',
    'vehicles.create': 'Vehicle created',
    'vehicles.update': 'Vehicle updated',
    'vehicles.archive': 'Vehicle archived',
    'vehicles.restore': 'Vehicle restored',
    'vehicles.decode_vin': 'VIN decoded',
    'invoices.create': 'Invoice created',
    'invoices.update': 'Invoice updated',
    'invoices.approve': 'Invoice approved',
    'invoices.send': 'Invoice sent',
    'invoices.mark_paid': 'Payment recorded',
    'invoices.duplicate': 'Invoice duplicated',
    'invoices.revision': 'Revision created',
    'portal_requests.approve': 'Portal request approved',
    'portal_requests.reject': 'Portal request rejected',
    'service_logs.create': 'Service log created',
    'service_logs.update': 'Service log updated',
    'auth.login': 'Staff login',
    'auth.signup': 'User signup',
    'auth.verify_email': 'Email verified',
    'auth.resend_verification': 'Verification email resent',
    'users.approve': 'User approved',
    'users.reject': 'User rejected',
    'users.update': 'User updated',
    'files.upload': 'File uploaded',
    'files.archive': 'File archived',
    'catalog.create': 'Catalog item created',
    'catalog.update': 'Catalog item updated',
    'catalog.archive': 'Catalog item archived',
    'backup.completed': 'Backup completed',
    'setup.completed': 'Setup completed',
    'flags.updated': 'Settings updated',
  }
  if (known[action]) return known[action]
  if (action.startsWith('service_logs.status.')) {
    const status = action.replace('service_logs.status.', '').replace(/_/g, ' ')
    return `Status → ${status}`
  }
  return action.replace(/\./g, ' ')
}

export function auditActionPill(action: string, riskLevel?: string): { cls: string, label: string } {
  if (riskLevel === 'high' || action.includes('role') || action.includes('reject')) {
    return { cls: 'pill bad', label: action }
  }
  if (riskLevel === 'sensitive' || action.startsWith('auth.')) {
    return { cls: 'pill gray', label: action }
  }
  if (action.startsWith('backup.') || action.includes('completed') || action.includes('approve')) {
    return { cls: 'pill ok', label: action }
  }
  if (action.includes('import') || action.includes('export') || action.includes('pdf')) {
    return { cls: 'pill info', label: action }
  }
  if (action.includes('setup') || action.includes('flags')) {
    return { cls: 'pill warn', label: action }
  }
  return { cls: 'pill indigo', label: action }
}

function summarizeJson(data: unknown): string | null {
  if (data == null) return null
  if (typeof data === 'string') return data
  if (Array.isArray(data)) {
    if (!data.length) return null
    return data.map(String).join(', ')
  }
  if (typeof data === 'object') {
    const obj = data as Record<string, unknown>
    const parts: string[] = []
    for (const key of ['displayName', 'name', 'status', 'invoiceNumber', 'logNumber', 'reason']) {
      if (obj[key] != null && obj[key] !== '') parts.push(String(obj[key]))
    }
    if (parts.length) return parts.join(' · ')
    const keys = Object.keys(obj).slice(0, 3)
    if (!keys.length) return null
    return keys.map(k => `${k}: ${String(obj[k])}`).join(' · ')
  }
  return String(data)
}

export function auditDetailDisplay(row: Pick<AuditLogRow, 'entityType' | 'entityId' | 'action' | 'changedFields' | 'afterData' | 'beforeData'>): string {
  const after = summarizeJson(row.afterData)
  if (after) return after

  const changed = Array.isArray(row.changedFields) && row.changedFields.length
    ? `Fields: ${row.changedFields.join(', ')}`
    : null
  if (changed) return changed

  const before = summarizeJson(row.beforeData)
  if (before) return before

  const entity = entityTypeLabel(row.entityType)
  if (row.entityId) return `${entity} · ${row.entityId.slice(0, 8)}…`
  return entity
}

export function auditIpDisplay(ip: string | null | undefined): string {
  if (!ip?.trim()) return '—'
  if (ip === '::1' || ip === '127.0.0.1') return 'localhost'
  return ip
}

export { auditWhenDisplay }
