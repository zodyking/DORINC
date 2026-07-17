import { DEFAULT_CATALOG_CATEGORIES } from './catalog-default-categories'
import { DEFAULT_CATEGORY_KEYWORDS } from './catalog-category-keywords'
import {
  DEFAULT_LABOR_DESCRIPTION_VERBS,
  DEFAULT_PART_DESCRIPTION_VERBS,
  DEFAULT_FEE_DESCRIPTION_VERBS,
} from './line-item-type-from-description'

export interface BusinessProfile {
  businessName: string
  phone: string
  email: string
  website: string
  addressLine1: string
  addressLine2: string
  city: string
  state: string
  postalCode: string
  country: string
  /** Sales tax ID / EIN shown on invoices when set. */
  taxId: string
  /** Default sales tax rate as a percent e.g. "6.6" for 6.6%. */
  defaultTaxRatePercent: string
}

export const DEFAULT_BUSINESS_PROFILE: BusinessProfile = {
  businessName: '',
  phone: '',
  email: '',
  website: '',
  addressLine1: '',
  addressLine2: '',
  city: '',
  state: '',
  postalCode: '',
  country: 'US',
  taxId: '',
  defaultTaxRatePercent: '0',
}

export interface LineTypeVerbSettings {
  part: string[]
  labor: string[]
  fee: string[]
}

export const DEFAULT_LINE_TYPE_VERBS: LineTypeVerbSettings = {
  part: [...DEFAULT_PART_DESCRIPTION_VERBS],
  labor: [...DEFAULT_LABOR_DESCRIPTION_VERBS],
  fee: [...DEFAULT_FEE_DESCRIPTION_VERBS],
}

export type CatalogKeywordMap = Record<string, string[]>

/** Full default keyword map keyed by category name. */
export function defaultCatalogKeywordMap(): CatalogKeywordMap {
  const map: CatalogKeywordMap = {}
  for (const name of DEFAULT_CATALOG_CATEGORIES) {
    map[name] = [...(DEFAULT_CATEGORY_KEYWORDS[name] ?? [name])]
  }
  return map
}

export interface InvoiceWorkspaceSettings {
  defaultPaymentTermsDays: number
  shopSuppliesPercent: string
  managerApprovalThreshold: string
}

export const DEFAULT_INVOICE_SETTINGS: InvoiceWorkspaceSettings = {
  defaultPaymentTermsDays: 30,
  shopSuppliesPercent: '3.5',
  managerApprovalThreshold: '5000.00',
}

/** App-wide email notification toggles (Control Panel → Notifications). */
export interface NotificationSettings {
  /** Email the signed-in staff user when their account is used to sign in. */
  staffLoginAlert: boolean
  /** Email the customer portal user when their portal account is used to sign in. */
  customerLoginAlert: boolean
  /** Email deletion reviewers when a new deletion request is submitted. */
  deletionRequestSubmitted: boolean
  /** Email the requestor when their deletion request is approved or denied. */
  deletionRequestResult: boolean
  /** Send invoice PDF / portal invoice-ready emails to customers. */
  invoiceEmail: boolean
  /** Send estimate-ready emails to customers. */
  estimateEmail: boolean
  /** Notify customers when portal requests are approved or rejected. */
  portalRequestStatus: boolean
  /** Send portal credential emails when staff issues access. */
  portalCredentials: boolean
  /** Email backup success/failure alerts to the configured notify address. */
  backupResult: boolean
  /** Notify user managers when a new staff signup is awaiting approval. */
  userSignupPendingApproval: boolean
  /** Notify invoice approvers when an invoice needs manager approval. */
  invoicePendingApproval: boolean
  /** Email all team members when a customer submits a portal service request. */
  customerServiceRequestSubmitted: boolean
  /** Email all accountants when a customer submits a billing or vehicle change request. */
  customerChangeRequestSubmitted: boolean
  /** Email all team members when a new customer email arrives in the inbox. */
  customerEmailReceived: boolean
}

export const DEFAULT_NOTIFICATION_SETTINGS: NotificationSettings = {
  staffLoginAlert: true,
  customerLoginAlert: true,
  deletionRequestSubmitted: true,
  deletionRequestResult: true,
  invoiceEmail: true,
  estimateEmail: true,
  portalRequestStatus: true,
  portalCredentials: true,
  backupResult: true,
  userSignupPendingApproval: true,
  invoicePendingApproval: true,
  customerServiceRequestSubmitted: true,
  customerChangeRequestSubmitted: true,
  customerEmailReceived: true,
}

/** Workspace chat settings (Control Panel → Chat). */
export interface ChatWorkspaceSettings {
  /** When false, staff see only the shared Team conversation (no DM list or new DM). */
  directMessagingEnabled: boolean
}

export const DEFAULT_CHAT_SETTINGS: ChatWorkspaceSettings = {
  directMessagingEnabled: false,
}

export const NOTIFICATION_SETTING_META: Array<{
  key: keyof NotificationSettings
  label: string
  description: string
  group: 'security' | 'workflow' | 'customer' | 'system'
}> = [
  {
    key: 'staffLoginAlert',
    label: 'Staff sign-in alerts',
    description: 'Email staff when their account signs in.',
    group: 'security',
  },
  {
    key: 'customerLoginAlert',
    label: 'Customer portal sign-in alerts',
    description: 'Email portal users when their account signs in.',
    group: 'security',
  },
  {
    key: 'userSignupPendingApproval',
    label: 'New user awaiting approval',
    description: 'Notify user managers when a staff signup finishes email verification.',
    group: 'security',
  },
  {
    key: 'deletionRequestSubmitted',
    label: 'Deletion request submitted',
    description: 'Notify reviewers when someone requests a record deletion.',
    group: 'workflow',
  },
  {
    key: 'deletionRequestResult',
    label: 'Deletion request result',
    description: 'Email the requestor when a deletion request is approved or denied.',
    group: 'workflow',
  },
  {
    key: 'invoicePendingApproval',
    label: 'Invoice pending approval',
    description: 'Notify approvers when an invoice needs manager approval.',
    group: 'workflow',
  },
  {
    key: 'customerServiceRequestSubmitted',
    label: 'Customer service request',
    description: 'Email all team members when a customer submits a portal service request.',
    group: 'workflow',
  },
  {
    key: 'customerChangeRequestSubmitted',
    label: 'Customer change request',
    description: 'Email all accountants when a customer submits a billing or vehicle correction request.',
    group: 'workflow',
  },
  {
    key: 'customerEmailReceived',
    label: 'Customer email received',
    description: 'Email all team members when a customer sends email to your inbox (new thread or reply).',
    group: 'workflow',
  },
  {
    key: 'invoiceEmail',
    label: 'Invoice emails',
    description: 'Send invoice PDFs and portal invoice-ready notices to customers.',
    group: 'customer',
  },
  {
    key: 'estimateEmail',
    label: 'Estimate emails',
    description: 'Send estimate-ready notices to customers.',
    group: 'customer',
  },
  {
    key: 'portalRequestStatus',
    label: 'Portal request status',
    description: 'Notify customers when portal requests are approved or rejected.',
    group: 'customer',
  },
  {
    key: 'portalCredentials',
    label: 'Portal credentials',
    description: 'Allow sending portal username and temporary password emails.',
    group: 'customer',
  },
  {
    key: 'backupResult',
    label: 'Backup results',
    description: 'Email backup success and failure alerts to the configured address.',
    group: 'system',
  },
]
