/**
 * Permission display helpers — maps raw permission keys into a
 * page-centric View → Edit → Delete table for the admin UI.
 */

import type { PermissionKey } from './keys'
import { PERMISSIONS } from './keys'

export type PermissionColumn = 'view' | 'edit' | 'delete' | 'other'

export interface PermissionCell {
  key: PermissionKey
  label: string
  description: string
  column: PermissionColumn
}

export interface PermissionArea {
  id: string
  label: string
  description?: string
  /** Primary view permission — controls whether the page appears in navigation. */
  navKeys: PermissionKey[]
  cells: PermissionCell[]
}

function cell(
  key: PermissionKey,
  label: string,
  column: PermissionColumn,
): PermissionCell {
  return {
    key,
    label,
    description: PERMISSIONS[key],
    column,
  }
}

/** Ordered list of permission areas shown in the admin UI. */
export const PERMISSION_AREAS: PermissionArea[] = [
  {
    id: 'invoices',
    label: 'Invoices',
    description: 'Create, send, and manage invoices',
    navKeys: ['invoices.read.all'],
    cells: [
      cell('invoices.read.all', 'View page', 'view'),
      cell('invoices.create.all', 'Create', 'edit'),
      cell('invoices.update.all', 'Edit drafts', 'edit'),
      cell('invoices.approve.all', 'Approve', 'edit'),
      cell('invoices.send.all', 'Send', 'edit'),
      cell('invoices.record_payment.all', 'Record payments', 'edit'),
      cell('invoices.generate_pdf.all', 'Generate PDFs', 'edit'),
    ],
  },
  {
    id: 'customers',
    label: 'Customers',
    description: 'Customer records and portal access',
    navKeys: ['customers.read.all'],
    cells: [
      cell('customers.read.all', 'View page', 'view'),
      cell('customers.create.all', 'Create', 'edit'),
      cell('customers.update.all', 'Edit', 'edit'),
      cell('customers.portal_access.all', 'Portal access', 'edit'),
      cell('customers.send_credentials.all', 'Send credentials', 'edit'),
      cell('customers.archive.all', 'Archive / restore', 'delete'),
    ],
  },
  {
    id: 'vehicles',
    label: 'Vehicles',
    description: 'Fleet and vehicle records',
    navKeys: ['vehicles.read.all'],
    cells: [
      cell('vehicles.read.all', 'View page', 'view'),
      cell('vehicles.create.all', 'Create', 'edit'),
      cell('vehicles.update.all', 'Edit', 'edit'),
      cell('vehicles.decode_vin.all', 'Decode VIN', 'edit'),
      cell('vehicles.archive.all', 'Archive / restore', 'delete'),
    ],
  },
  {
    id: 'service_logs',
    label: 'Service Logs',
    description: 'Upload, review, and convert service logs',
    navKeys: ['service_logs.read.all', 'service_logs.read.own'],
    cells: [
      cell('service_logs.read.all', 'View all', 'view'),
      cell('service_logs.read.own', 'View own', 'view'),
      cell('service_logs.upload.own', 'Upload', 'edit'),
      cell('service_logs.review.all', 'Review', 'edit'),
      cell('service_logs.convert.all', 'Convert to invoice', 'edit'),
      cell('service_logs.convert.own', 'Send own to invoice', 'edit'),
      cell('service_logs.revert_invoice.own', 'Undo send to invoice', 'edit'),
    ],
  },
  {
    id: 'staples',
    label: 'Staples',
    description: 'Staples PrintMe release codes and blank sheet printing',
    navKeys: ['staples.read.all'],
    cells: [
      cell('staples.read.all', 'View page', 'view'),
      cell('staples.print.all', 'Send to PrintMe', 'edit'),
    ],
  },
  {
    id: 'catalog',
    label: 'Catalog',
    description: 'Parts, labor rates, and categories',
    navKeys: ['catalog.read.all'],
    cells: [
      cell('catalog.read.all', 'View page', 'view'),
      cell('catalog.manage.all', 'Manage items', 'edit'),
    ],
  },
  {
    id: 'estimates',
    label: 'Estimates',
    description: 'Quotes and estimate documents',
    navKeys: ['estimates.read.all'],
    cells: [
      cell('estimates.read.all', 'View page', 'view'),
      cell('estimates.manage.all', 'Manage', 'edit'),
      cell('estimates.generate_pdf.all', 'Generate PDFs', 'edit'),
    ],
  },
  {
    id: 'templates',
    label: 'Templates',
    description: 'Invoice PDF and email templates',
    navKeys: ['templates.read.all'],
    cells: [
      cell('templates.read.all', 'View page', 'view'),
      cell('templates.manage.all', 'Manage', 'edit'),
    ],
  },
  {
    id: 'reports',
    label: 'Reports',
    description: 'Financial and productivity reports',
    navKeys: ['reports.read.all'],
    cells: [
      cell('reports.read.all', 'View page', 'view'),
    ],
  },
  {
    id: 'training',
    label: 'Training',
    description: 'Staff training modules',
    navKeys: ['training.read.all', 'training.complete.own'],
    cells: [
      cell('training.read.all', 'View all progress', 'view'),
      cell('training.complete.own', 'Access training', 'view'),
      cell('training.manage.all', 'Assign modules', 'edit'),
    ],
  },
  {
    id: 'portal_requests',
    label: 'Portal Requests',
    description: 'Customer-submitted change requests',
    navKeys: ['portal_requests.review.all'],
    cells: [
      cell('portal_requests.review.all', 'View & review', 'view'),
    ],
  },
  {
    id: 'deletion_requests',
    label: 'Deletion Requests',
    description: 'Approve or reject record deletion requests',
    navKeys: ['deletion_requests.review.all'],
    cells: [
      cell('deletion_requests.review.all', 'View & review', 'view'),
      cell('deletion_requests.submit.all', 'Request deletion', 'delete'),
    ],
  },
  {
    id: 'users',
    label: 'Users',
    description: 'Staff accounts and access',
    navKeys: ['users.read.all'],
    cells: [
      cell('users.read.all', 'View page', 'view'),
      cell('users.manage.all', 'Manage accounts', 'edit'),
      cell('users.permissions.all', 'Edit permissions', 'edit'),
    ],
  },
  {
    id: 'roles',
    label: 'Roles & Permissions',
    description: 'Role bundles and permission defaults',
    navKeys: ['roles.manage.all'],
    cells: [
      cell('roles.manage.all', 'View & manage', 'view'),
    ],
  },
  {
    id: 'audit',
    label: 'System Logs',
    description: 'Audit trail and activity history',
    navKeys: ['audit.read.all'],
    cells: [
      cell('audit.read.all', 'View page', 'view'),
    ],
  },
  {
    id: 'system',
    label: 'Control Panel',
    description: 'System settings and configuration',
    navKeys: ['system.admin.all'],
    cells: [
      cell('system.admin.all', 'View page', 'view'),
      cell('backups.manage.all', 'Manage backups', 'edit'),
    ],
  },
  {
    id: 'files',
    label: 'Files',
    description: 'Uploaded documents and attachments',
    navKeys: ['files.read.all'],
    cells: [
      cell('files.read.all', 'View files', 'view'),
      cell('files.upload.all', 'Upload', 'edit'),
      cell('files.archive.all', 'Archive', 'delete'),
    ],
  },
  {
    id: 'records',
    label: 'Record Reassignment',
    description: 'Move records between customers',
    navKeys: [],
    cells: [
      cell('records.reassign.all', 'Reassign records', 'edit'),
    ],
  },
  {
    id: 'messages',
    label: 'Messages',
    description: 'Direct staff messaging',
    navKeys: ['messages.read.own'],
    cells: [
      cell('messages.read.own', 'View messages', 'view'),
      cell('messages.send.own', 'Send messages', 'edit'),
    ],
  },
  {
    id: 'email',
    label: 'Email',
    description: 'Outbound email to non-customers',
    navKeys: [],
    cells: [
      cell('email.send_noncustomer.all', 'Send email', 'edit'),
    ],
  },
  {
    id: 'ai',
    label: 'AI Features',
    description: 'AI-assisted tools and settings',
    navKeys: [],
    cells: [
      cell('ai.help.all', 'Help assistant', 'other'),
      cell('ai.extract.all', 'Service log extraction', 'other'),
      cell('ai.describe.all', 'Invoice descriptions', 'other'),
      cell('ai.admin.all', 'Provider settings', 'other'),
    ],
  },
  {
    id: 'billing',
    label: 'Infrastructure Billing',
    description: 'Vultr, Cloudflare, and OpenRouter cost monitoring',
    navKeys: ['billing.read.all'],
    cells: [
      cell('billing.read.all', 'View page', 'view'),
    ],
  },
  {
    id: 'portal',
    label: 'Customer Portal',
    description: 'Customer self-service access',
    navKeys: ['portal.read.own'],
    cells: [
      cell('portal.read.own', 'View portal', 'view'),
      cell('portal.requests.own', 'Submit requests', 'edit'),
    ],
  },
]

export const PERMISSION_COLUMN_LABELS: Record<PermissionColumn, string> = {
  view: 'View page',
  edit: 'Edit',
  delete: 'Request deletion',
  other: 'Other',
}

/** All permission keys referenced by the display areas. */
export const DISPLAY_PERMISSION_KEYS = new Set(
  PERMISSION_AREAS.flatMap(a => a.cells.map(c => c.key)),
)

export function cellsForColumn(area: PermissionArea, column: PermissionColumn): PermissionCell[] {
  return area.cells.filter(c => c.column === column)
}

export function hasColumn(area: PermissionArea, column: PermissionColumn): boolean {
  return area.cells.some(c => c.column === column)
}

export function areaHasAnyKey(area: PermissionArea, keys: Set<string>): boolean {
  return area.cells.some(c => keys.has(c.key))
}

/** Areas that have at least one permission key present in the given set. */
export function filterAreasByKeys(keys: Set<string>): PermissionArea[] {
  return PERMISSION_AREAS.filter(a => areaHasAnyKey(a, keys))
}

/** Areas relevant for staff (excludes customer portal unless needed). */
export function staffPermissionAreas(): PermissionArea[] {
  return PERMISSION_AREAS.filter(a => a.id !== 'portal')
}

export type OverrideState = 'inherit' | 'allow' | 'deny'

export interface PermissionStatus {
  key: PermissionKey
  label: string
  granted: boolean
  override: OverrideState
  fromRole: boolean
  locked?: boolean
}

export function resolvePermissionStatus(
  key: PermissionKey,
  label: string,
  roleGrants: Set<string>,
  overrideStates: Record<string, OverrideState>,
  locked = false,
): PermissionStatus {
  const override = overrideStates[key] ?? 'inherit'
  const fromRole = roleGrants.has(key)
  let granted = fromRole
  if (override === 'allow') granted = true
  if (override === 'deny') granted = false

  return { key, label, granted, override, fromRole, locked }
}

export function canViewPage(
  area: PermissionArea,
  roleGrants: Set<string>,
  overrideStates: Record<string, OverrideState>,
): boolean {
  if (!area.navKeys.length) {
    const viewCells = cellsForColumn(area, 'view')
    if (!viewCells.length) return false
    return viewCells.some(c =>
      resolvePermissionStatus(c.key, c.label, roleGrants, overrideStates).granted,
    )
  }
  return area.navKeys.some(key =>
    resolvePermissionStatus(key, '', roleGrants, overrideStates).granted,
  )
}
