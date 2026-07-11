export interface MockupScreen {
  id: string
  name: string
  path: string
  heading: string | RegExp
  auth: 'none' | 'staff' | 'portal'
}

/** Mockup screen registry — maps BUILD-CHECKLIST / invoice-ui-mockups.html sections to routes. */
export const MOCKUP_SCREENS: MockupScreen[] = [
  { id: 'auth-login', name: 'AUTH login', path: '/auth/login', heading: /Sign in|DORINC/i, auth: 'none' },
  { id: 'auth-signup', name: 'AUTH signup', path: '/auth/signup', heading: /DORINC/i, auth: 'none' },
  { id: 'setup-wizard', name: 'SERVER SETUP WIZARD', path: '/setup', heading: /Setup is locked|Server setup walkthrough/i, auth: 'none' },
  { id: 'dashboard', name: 'PAGE: DASHBOARD', path: '/dashboard', heading: /.+/i, auth: 'staff' },
  { id: 'invoices', name: 'PAGE: INVOICES', path: '/invoices', heading: 'Invoices', auth: 'staff' },
  { id: 'invoice-detail', name: 'PAGE: INVOICE DETAIL', path: '/invoices/{invoiceId}', heading: /INV-/i, auth: 'staff' },
  { id: 'invoice-creator', name: 'PAGE: INVOICE CREATOR', path: '/invoices/new', heading: /New Invoice/i, auth: 'staff' },
  { id: 'invoice-editor', name: 'PAGE: INVOICE EDITOR', path: '/invoices/{editorInvoiceId}/edit', heading: /Invoice Editor/i, auth: 'staff' },
  { id: 'invoice-payment', name: 'PAGE: RECORD PAYMENT', path: '/invoices/{invoiceId}/payment', heading: /Record payment/i, auth: 'staff' },
  { id: 'template-designer', name: 'PAGE: TEMPLATE DESIGNER', path: '/templates/designer', heading: /Template Editor/i, auth: 'staff' },
  { id: 'customers', name: 'PAGE: CUSTOMERS', path: '/customers', heading: 'Customers', auth: 'staff' },
  { id: 'customer-detail', name: 'PAGE: CUSTOMER DETAIL', path: '/customers/{customerId}', heading: /.+/i, auth: 'staff' },
  { id: 'vehicles', name: 'PAGE: VEHICLES', path: '/vehicles', heading: 'Vehicles', auth: 'staff' },
  { id: 'vehicle-detail', name: 'PAGE: VEHICLE DETAIL', path: '/vehicles/{vehicleId}', heading: /.+/i, auth: 'staff' },
  { id: 'service-log-new', name: 'PAGE: NEW SERVICE LOG', path: '/service-logs/new', heading: /New service log|Service log/i, auth: 'staff' },
  { id: 'service-logs', name: 'PAGE: SERVICE LOGS', path: '/service-logs', heading: /Service Logs/i, auth: 'staff' },
  { id: 'service-log-detail', name: 'PAGE: SERVICE LOG DETAIL', path: '/service-logs/{serviceLogId}', heading: /.+/i, auth: 'staff' },
  { id: 'catalog', name: 'PAGE: CATALOG', path: '/catalog', heading: 'Catalog', auth: 'staff' },
  { id: 'admin-panel', name: 'PAGE: CONTROL PANEL', path: '/admin', heading: /Control Panel/i, auth: 'staff' },
  { id: 'system-logs', name: 'PAGE: SYSTEM LOGS', path: '/system-logs', heading: /System Logs/i, auth: 'staff' },
  { id: 'users', name: 'PAGE: USERS', path: '/users', heading: 'Users', auth: 'staff' },
  { id: 'user-detail', name: 'PAGE: USER DETAIL', path: '/users/{pendingUserId}', heading: /.+/i, auth: 'staff' },
  { id: 'account', name: 'PAGE: MY ACCOUNT', path: '/account', heading: /My Account/i, auth: 'staff' },
  { id: 'portal-requests', name: 'Portal request review', path: '/portal-requests', heading: /Portal requests|Requests/i, auth: 'staff' },
  { id: 'portal-home', name: 'CUSTOMER PORTAL home', path: '/portal', heading: /.+/i, auth: 'portal' },
  { id: 'portal-invoices', name: 'Portal invoices list', path: '/portal/invoices', heading: /Invoices/i, auth: 'portal' },
  { id: 'portal-invoice-detail', name: 'Portal invoice detail', path: '/portal/invoices/{invoiceId}', heading: /INV-/i, auth: 'portal' },
  { id: 'portal-estimates', name: 'Portal estimates list', path: '/portal/estimates', heading: /Estimates/i, auth: 'portal' },
  { id: 'portal-estimate-detail', name: 'Portal estimate detail', path: '/portal/estimates/{estimateId}', heading: /EST-/i, auth: 'portal' },
  { id: 'portal-vehicles', name: 'Portal vehicles', path: '/portal/vehicles', heading: /Vehicles/i, auth: 'portal' },
  { id: 'portal-requests-list', name: 'Portal requests', path: '/portal/requests', heading: /Requests/i, auth: 'portal' },
  { id: 'portal-account', name: 'Portal account', path: '/portal/account', heading: /Account/i, auth: 'portal' },
]

export function resolveScreenPath(template: string, ids: Record<string, string>) {
  return template.replace(/\{(\w+)\}/g, (_, key: string) => ids[key] ?? '')
}
