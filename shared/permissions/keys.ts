/**
 * Permission key registry — `module.action.scope` (SPEC §4).
 * Account types carry permission bundles; user overrides allowed; deny wins.
 */

export const PERMISSION_SCOPES = ['all', 'own'] as const
export type PermissionScope = (typeof PERMISSION_SCOPES)[number]

/** Canonical permission keys used across the app. */
export const PERMISSIONS = {
  // Customers
  'customers.read.all': 'View all customers',
  'customers.create.all': 'Create customers',
  'customers.update.all': 'Update customers',
  'customers.archive.all': 'Archive/restore customers',
  'customers.portal_access.all': 'Manage customer portal access',
  'customers.send_credentials.all': 'Send portal credential emails',

  // Vehicles
  'vehicles.read.all': 'View all vehicles',
  'vehicles.create.all': 'Create vehicles',
  'vehicles.update.all': 'Update vehicles',
  'vehicles.archive.all': 'Archive/restore vehicles',
  'vehicles.decode_vin.all': 'Decode VINs',

  // Catalog
  'catalog.read.all': 'View catalog',
  'catalog.manage.all': 'Manage catalog items and labor rates',

  // Service logs
  'service_logs.read.all': 'View all service logs',
  'service_logs.read.own': 'View own service logs',
  'service_logs.upload.own': 'Upload own service logs',
  'service_logs.review.all': 'Review service logs',
  'service_logs.convert.all': 'Convert service logs to invoices',

  // Invoices
  'invoices.read.all': 'View all invoices',
  'invoices.create.all': 'Create invoices',
  'invoices.update.all': 'Edit draft invoices',
  'invoices.approve.all': 'Approve invoices',
  'invoices.send.all': 'Send invoices',
  'invoices.void.all': 'Void invoices',
  'invoices.record_payment.all': 'Record payments',
  'invoices.generate_pdf.all': 'Generate invoice PDFs',

  // Estimates (Phase 3)
  'estimates.read.all': 'View estimates',
  'estimates.manage.all': 'Manage estimates',
  'estimates.generate_pdf.all': 'Generate estimate PDFs',

  // Templates
  'templates.read.all': 'View invoice templates',
  'templates.manage.all': 'Manage invoice templates',

  // Reports (Phase 3)
  'reports.read.all': 'View financial and productivity reports',

  // Files
  'files.upload.all': 'Upload files',
  'files.read.all': 'Read files',
  'files.archive.all': 'Archive files',

  // Users + permissions
  'users.read.all': 'View users',
  'users.manage.all': 'Manage users (approve, disable, account type)',
  'users.permissions.all': 'Manage permission overrides',

  // Audit
  'audit.read.all': 'View audit logs',

  // AI
  'ai.extract.all': 'Run service log extraction',
  'ai.describe.all': 'Use invoice description writer',
  'ai.help.all': 'Use platform help assistant',
  'ai.admin.all': 'Manage AI provider settings',

  // Backups + system
  'backups.manage.all': 'Run and manage backups',
  'system.admin.all': 'Super Admin control panel',

  // Customer portal (customer accounts)
  'portal.read.own': 'View own portal data',
  'portal.requests.own': 'Submit portal requests',

  // Portal request review (staff)
  'portal_requests.review.all': 'Review customer portal requests',

  // Deletion requests (staff submit → admin approve)
  'deletion_requests.submit.all': 'Request record deletion',
  'deletion_requests.review.all': 'Approve or reject deletion requests',
} as const

export type PermissionKey = keyof typeof PERMISSIONS

export const ALL_PERMISSION_KEYS = Object.keys(PERMISSIONS) as PermissionKey[]

/** Account types — fixed set, no roles layer (SPEC §4). */
export const ACCOUNT_TYPES = [
  'super_admin',
  'admin',
  'manager',
  'accountant',
  'mechanic',
  'viewer',
  'external_auditor',
  'customer',
] as const

export type AccountType = (typeof ACCOUNT_TYPES)[number]

/** Default permission bundles per account type (SPEC §4 summaries). */
export const ACCOUNT_TYPE_BUNDLES: Record<AccountType, PermissionKey[]> = {
  super_admin: ALL_PERMISSION_KEYS,
  admin: ALL_PERMISSION_KEYS.filter(k => k !== 'system.admin.all'),
  manager: [
    'customers.read.all', 'customers.create.all', 'customers.update.all', 'customers.archive.all',
    'vehicles.read.all', 'vehicles.create.all', 'vehicles.update.all', 'vehicles.archive.all', 'vehicles.decode_vin.all',
    'catalog.read.all', 'catalog.manage.all',
    'service_logs.read.all', 'service_logs.review.all', 'service_logs.convert.all',
    'invoices.read.all', 'invoices.create.all', 'invoices.update.all', 'invoices.approve.all',
    'invoices.send.all', 'invoices.record_payment.all', 'invoices.generate_pdf.all', 'invoices.void.all',
    'estimates.read.all', 'estimates.manage.all', 'estimates.generate_pdf.all',
    'templates.read.all',
    'reports.read.all',
    'files.upload.all', 'files.read.all',
    'users.read.all',
    'audit.read.all',
    'ai.describe.all', 'ai.help.all',
    'portal_requests.review.all',
    'deletion_requests.submit.all',
  ],
  accountant: [
    'customers.read.all', 'customers.create.all', 'customers.update.all',
    'customers.portal_access.all', 'customers.send_credentials.all',
    'vehicles.read.all', 'vehicles.create.all', 'vehicles.update.all', 'vehicles.decode_vin.all',
    'catalog.read.all', 'catalog.manage.all',
    'service_logs.read.all', 'service_logs.review.all', 'service_logs.convert.all',
    'invoices.read.all', 'invoices.create.all', 'invoices.update.all', 'invoices.approve.all',
    'invoices.send.all', 'invoices.record_payment.all', 'invoices.generate_pdf.all', 'invoices.void.all',
    'estimates.read.all', 'estimates.manage.all', 'estimates.generate_pdf.all',
    'templates.read.all',
    'reports.read.all',
    'files.upload.all', 'files.read.all',
    'ai.extract.all', 'ai.describe.all', 'ai.help.all',
    'portal_requests.review.all',
    'deletion_requests.submit.all',
  ],
  mechanic: [
    'customers.read.all',
    'vehicles.read.all',
    'service_logs.read.own', 'service_logs.upload.own',
    'files.upload.all',
    'ai.help.all',
    'deletion_requests.submit.all',
  ],
  viewer: [
    'customers.read.all',
    'vehicles.read.all',
    'catalog.read.all',
    'service_logs.read.all',
    'invoices.read.all',
    'estimates.read.all',
    'reports.read.all',
    'ai.help.all',
  ],
  external_auditor: [
    'customers.read.all',
    'invoices.read.all',
    'reports.read.all',
    'audit.read.all',
  ],
  customer: [
    'portal.read.own',
    'portal.requests.own',
  ],
}
