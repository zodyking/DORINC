/** Plain-English audit log messages shared by UI formatters. */

export interface AuditMessageInput {
  action: string
  entityType?: string
  actorName?: string | null
  changedFields?: string[] | null
  beforeData?: unknown
  afterData?: unknown
}

const PAYMENT_TERMS_LABELS: Record<string, string> = {
  due_on_receipt: 'Due on receipt',
  net_15: 'Net 15',
  net_30: 'Net 30',
  net_45: 'Net 45',
  net_60: 'Net 60',
}

const LINE_TYPE_LABELS: Record<string, string> = {
  part: 'Part',
  labor: 'Labor',
  fee: 'Fee',
}

const FIELD_LABELS: Record<string, string> = {
  invoiceDate: 'invoice date',
  dueDate: 'due date',
  paymentTerms: 'payment terms',
  poNumber: 'PO / reference',
  customerId: 'customer',
  vehicleId: 'vehicle',
  complaint: 'customer complaint',
  internalNotes: 'internal notes',
  customerNotes: 'customer notes',
  unitPrice: 'rate',
  quantity: 'quantity',
  description: 'description',
  lineType: 'type',
  lineAmount: 'amount',
  displayName: 'name',
  status: 'status',
  taxExempt: 'tax exempt',
  taxRate: 'tax rate',
  discountAmount: 'discount',
  amountPaid: 'amount paid',
  vin: 'VIN',
  busNumber: 'bus number',
  unitTag: 'unit tag',
  make: 'make',
  model: 'model',
  year: 'year',
  email: 'email',
  name: 'name',
  accountTypeId: 'role',
  isActive: 'active status',
}

const ACTION_LABELS: Record<string, string> = {
  'customers.create': 'Customer created',
  'customers.update': 'Customer updated',
  'customers.archive': 'Customer archived',
  'customers.restore': 'Customer restored',
  'customers.portal_enable': 'Customer portal enabled',
  'customers.portal_disable': 'Customer portal disabled',
  'customers.credential_email_send': 'Login credentials emailed',
  'vehicles.create': 'Vehicle created',
  'vehicles.update': 'Vehicle updated',
  'vehicles.archive': 'Vehicle archived',
  'vehicles.restore': 'Vehicle restored',
  'vehicles.decode_vin': 'VIN decoded',
  'vehicles.reassign': 'Vehicle reassigned',
  'invoices.create': 'Invoice created',
  'invoices.update': 'Invoice details updated',
  'invoices.submit_for_manager_approval': 'Invoice submitted for manager approval before send',
  'invoices.send': 'Invoice finalized and sent',
  'invoices.send_queued': 'Invoice queued for email delivery',
  'invoices.mark_paid': 'Payment recorded',
  'invoices.duplicate': 'Invoice duplicated',
  'invoices.revision': 'Revision invoice created',
  'invoices.reassign_customer': 'Customer reassigned',
  'invoices.reassign_vehicle': 'Vehicle changed',
  'invoices.update_dates': 'Invoice dates updated',
  'invoices.line_items.create': 'Line item added',
  'invoices.line_items.update': 'Line item updated',
  'invoices.line_items.delete': 'Line item removed',
  'invoices.generate_pdf': 'PDF generated',
  'invoices.pdf_download': 'PDF downloaded',
  'service_logs.create': 'Service log created',
  'service_logs.update': 'Service log updated',
  'service_logs.convert_to_invoice': 'Converted to invoice',
  'auth.login': 'Staff signed in',
  'auth.logout': 'Staff signed out',
  'auth.signup': 'New user registered',
  'auth.verify_email': 'Email verified',
  'auth.resend_verification': 'Verification email resent',
  'auth.forgot_password': 'Password reset requested',
  'auth.reset_password': 'Password reset completed',
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
  'editing_sessions.acquire': 'Opened for editing',
  'editing_sessions.release': 'Finished editing',
  'editing_sessions.admin_release': 'Editing lock released by admin',
  'portal_requests.approve': 'Portal request approved',
  'portal_requests.reject': 'Portal request rejected',
}

const ENTITY_HISTORY_NOISE = new Set([
  'editing_sessions.acquire',
  'editing_sessions.release',
  'editing_sessions.admin_release',
])

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {}
}

function stringVal(value: unknown): string | null {
  if (value == null) return null
  const text = String(value).trim()
  return text || null
}

function moneyVal(value: unknown): string | null {
  const raw = stringVal(value)
  if (!raw) return null
  const parsed = Number.parseFloat(raw)
  if (!Number.isFinite(parsed)) return raw
  return `$${parsed.toFixed(2)}`
}

function fieldLabel(field: string): string {
  return FIELD_LABELS[field] ?? field.replace(/_/g, ' ').replace(/([A-Z])/g, ' $1').trim().toLowerCase()
}

function displayValue(field: string, value: unknown): string {
  if (value == null || value === '') return '—'
  if (field === 'paymentTerms') return PAYMENT_TERMS_LABELS[String(value)] ?? String(value)
  if (field === 'lineType') return LINE_TYPE_LABELS[String(value)] ?? String(value)
  if (field === 'unitPrice' || field === 'lineAmount' || field === 'discountAmount' || field === 'amountPaid') {
    return moneyVal(value) ?? String(value)
  }
  if (field === 'taxExempt') return value ? 'yes' : 'no'
  if (typeof value === 'boolean') return value ? 'yes' : 'no'
  return String(value)
}

function describeFieldChange(field: string, before: unknown, after: unknown): string | null {
  if (JSON.stringify(before) === JSON.stringify(after)) return null
  const label = fieldLabel(field)
  return `Changed ${label} from ${displayValue(field, before)} to ${displayValue(field, after)}`
}

function describeChanges(
  before: Record<string, unknown>,
  after: Record<string, unknown>,
  fields: string[],
  skipFields: string[] = [],
): string[] {
  return fields
    .filter(field => !skipFields.includes(field))
    .map(field => describeFieldChange(field, before[field], after[field]))
    .filter((part): part is string => Boolean(part))
}

function lineDescription(before: Record<string, unknown>, after: Record<string, unknown>): string {
  return stringVal(after.description) ?? stringVal(before.description) ?? 'line item'
}

export function isEditingSessionNoise(action: string): boolean {
  return ENTITY_HISTORY_NOISE.has(action)
}

export function auditActionShortLabel(action: string): string {
  if (ACTION_LABELS[action]) return ACTION_LABELS[action]
  if (action.startsWith('service_logs.status.')) {
    const status = action.replace('service_logs.status.', '').replace(/_/g, ' ')
    return `Service log status changed to ${status}`
  }
  if (action.startsWith('ai.')) {
    return action.replace(/^ai\./, 'AI ').replace(/\./g, ' ')
  }
  return action.replace(/\./g, ' · ').replace(/_/g, ' ')
}

export function formatAuditChangeMessage(input: AuditMessageInput): string {
  const before = asRecord(input.beforeData)
  const after = asRecord(input.afterData)
  const fields = Array.isArray(input.changedFields) ? input.changedFields : []

  if (input.action === 'invoices.line_items.create') {
    const desc = stringVal(after.description) ?? 'line item'
    const amt = moneyVal(after.lineAmount)
    return amt ? `Added line "${desc}" (${amt})` : `Added line "${desc}"`
  }

  if (input.action === 'invoices.line_items.delete') {
    const desc = lineDescription(before, after)
    const amt = moneyVal(before.lineAmount ?? after.lineAmount)
    return amt ? `Removed line "${desc}" (${amt})` : `Removed line "${desc}"`
  }

  if (input.action === 'invoices.line_items.update') {
    const desc = lineDescription(before, after)
    const parts = describeChanges(before, after, fields, ['updatedAt', 'updatedBy', 'catalogItemId', 'catalogSnapshot'])
    if (parts.length) return `${parts.join('; ')} on "${desc}"`
    if (fields.includes('lineAmount') || fields.includes('quantity') || fields.includes('unitPrice')) {
      const oldAmt = moneyVal(before.lineAmount)
      const newAmt = moneyVal(after.lineAmount)
      if (oldAmt && newAmt && oldAmt !== newAmt) {
        return `Changed amount for "${desc}" from ${oldAmt} to ${newAmt}`
      }
    }
    return `Updated line "${desc}"`
  }

  if (input.action === 'invoices.update' || input.action === 'invoices.update_dates') {
    const parts = describeChanges(before, after, fields, ['updatedAt', 'updatedBy'])
    if (parts.length === 1) return parts[0]!
    if (parts.length) return `Updated invoice — ${parts.join('; ')}`
    return ACTION_LABELS[input.action] ?? 'Updated invoice details'
  }

  if (input.action === 'customers.update' || input.action === 'vehicles.update' || input.action === 'service_logs.update') {
    const parts = describeChanges(before, after, fields, ['updatedAt', 'updatedBy'])
    if (parts.length === 1) return parts[0]!
    if (parts.length) return parts.join('; ')
  }

  if (fields.length && Object.keys(before).length && Object.keys(after).length) {
    const parts = describeChanges(before, after, fields, ['updatedAt', 'updatedBy'])
    if (parts.length) return parts.join('; ')
  }

  const afterSummary = stringVal(after.displayName)
    ?? stringVal(after.description)
    ?? stringVal(after.name)
    ?? stringVal(after.invoiceNumber)
    ?? stringVal(after.logNumber)
  if (afterSummary && ACTION_LABELS[input.action]) {
    return `${ACTION_LABELS[input.action]} — ${afterSummary}`
  }

  if (ACTION_LABELS[input.action]) return ACTION_LABELS[input.action]

  if (fields.length) {
    const readable = fields.map(fieldLabel).join(', ')
    return `${auditActionShortLabel(input.action)} (${readable})`
  }

  return auditActionShortLabel(input.action)
}
