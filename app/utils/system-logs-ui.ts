// System logs (audit) list presentation helpers (mockup: PAGE: SYSTEM LOGS).

import { auditActionShortLabel, formatAuditChangeMessage } from '#shared/audit-messages'
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
  return auditActionShortLabel(action)
}

export function auditActionPill(action: string, riskLevel?: string): { cls: string, label: string } {
  const label = auditActionShortLabel(action)
  if (riskLevel === 'high' || action.includes('role') || action.includes('reject')) {
    return { cls: 'pill bad', label }
  }
  if (riskLevel === 'sensitive' || action.startsWith('auth.')) {
    return { cls: 'pill gray', label }
  }
  if (action.startsWith('backup.') || action.includes('completed') || action.includes('approve')) {
    return { cls: 'pill ok', label }
  }
  if (action.includes('import') || action.includes('export') || action.includes('pdf')) {
    return { cls: 'pill info', label }
  }
  if (action.includes('setup') || action.includes('flags')) {
    return { cls: 'pill warn', label }
  }
  return { cls: 'pill indigo', label }
}

export function auditDetailDisplay(row: Pick<AuditLogRow, 'entityType' | 'entityId' | 'action' | 'changedFields' | 'afterData' | 'beforeData' | 'actorName'>): string {
  return formatAuditChangeMessage({
    action: row.action,
    entityType: row.entityType,
    actorName: row.actorName,
    changedFields: Array.isArray(row.changedFields) ? row.changedFields as string[] : null,
    beforeData: row.beforeData,
    afterData: row.afterData,
  })
}

export function auditIpDisplay(ip: string | null | undefined): string {
  if (!ip?.trim()) return '—'
  if (ip === '::1' || ip === '127.0.0.1') return 'localhost'
  return ip
}

export { auditWhenDisplay }
