/**
 * Catalog of transactional SMS templates for Quo.
 * Defaults are notification-grade: no brand header, no greeting,
 * compact facts. Keep bodies within Quo's 1600-character send limit.
 */

export const SMS_BODY_MAX_CHARS = 1600

export interface SmsTemplateContent {
  /** Plain SMS body. Placeholders use {{variable}} syntax. */
  body: string
}

export type SmsTemplateAudience = 'customer' | 'staff' | 'system'
export type SmsTemplateGroup = 'security' | 'workflow' | 'system'

export interface SmsTemplateVariable {
  key: string
  label: string
}

export interface SmsTemplateDefinition {
  typeKey: string
  name: string
  description: string
  audience: SmsTemplateAudience
  group: SmsTemplateGroup
  defaults: SmsTemplateContent
  variables: SmsTemplateVariable[]
  sampleVars: Record<string, string>
}

export function emptySmsTemplateContent(): SmsTemplateContent {
  return { body: '' }
}

export function normalizeSmsTemplateContent(
  input: Partial<SmsTemplateContent> | null | undefined,
  fallback: SmsTemplateContent,
): SmsTemplateContent {
  const body = String(input?.body ?? fallback.body).trim() || fallback.body
  return { body }
}

/** Replace {{var}} tokens. Unknown keys become empty strings. */
export function interpolateSmsTemplate(template: string, vars: Record<string, string | null | undefined>): string {
  return String(template ?? '').replace(/\{\{\s*([\w.]+)\s*\}\}/g, (_, key: string) => {
    const value = vars[key]
    return value == null ? '' : String(value)
  })
}

export function applySmsTemplateContent(
  content: SmsTemplateContent,
  vars: Record<string, string | null | undefined>,
): SmsTemplateContent {
  return { body: interpolateSmsTemplate(content.body, vars) }
}

const brandVars: SmsTemplateVariable[] = [
  { key: 'brandName', label: 'Brand name' },
  { key: 'appUrl', label: 'App URL' },
]

export const SMS_TEMPLATE_CATALOG: SmsTemplateDefinition[] = [
  {
    typeKey: 'notify_channel_changed',
    name: 'Notification channel changed',
    description: 'Sent when a user’s Email vs Text preference changes (self-serve or admin).',
    audience: 'staff',
    group: 'security',
    defaults: {
      body: 'Notifications switched to {{channelLabel}}.',
    },
    variables: [
      ...brandVars,
      { key: 'name', label: 'User name' },
      { key: 'channelLabel', label: 'Channel label' },
      { key: 'leadMessage', label: 'Lead Message' },
      { key: 'detailMessage', label: 'Detail message' },
      { key: 'accountUrl', label: 'My Account URL' },
    ],
    sampleVars: {
      brandName: 'DORINC',
      name: 'Alex Rivera',
      channelLabel: 'Text',
      leadMessage: 'The system has changed your notification channel to Text.',
      detailMessage: 'Quicker, cleaner notifications without cluttering your email inbox. If you prefer emails, you can change this on the My Account page.',
      accountUrl: 'https://app.example.com/account',
      appUrl: 'https://app.example.com',
    },
  },
  {
    typeKey: 'dorinc_contact_card',
    name: 'DORINC contact card',
    description: 'Sent when Text notifications are enabled so the user can save the Dorinc / Susan AI vCard (logo included) on their phone.',
    audience: 'staff',
    group: 'security',
    defaults: {
      body: [
        'Save Dorinc to text Susan:',
        '{{contactUrl}}',
      ].join('\n'),
    },
    variables: [
      ...brandVars,
      { key: 'name', label: 'User name' },
      { key: 'contactUrl', label: 'vCard download URL' },
      { key: 'fromNumber', label: 'Quo from number' },
    ],
    sampleVars: {
      brandName: 'DORINC',
      name: 'Alex Rivera',
      contactUrl: 'https://app.example.com/api/public/dorinc-contact.vcf',
      fromNumber: '+12125550199',
      appUrl: 'https://app.example.com',
    },
  },
  {
    typeKey: 'login_notification',
    name: 'Sign-in alert',
    description: 'Sent when a staff or portal account signs in.',
    audience: 'staff',
    group: 'security',
    defaults: {
      body: [
        'New sign-in',
        '{{when}}',
        '{{locationLine}}',
        '{{device}}',
        'Not you? Change your password.',
      ].join('\n'),
    },
    variables: [
      ...brandVars,
      { key: 'name', label: 'User name' },
      { key: 'when', label: 'Sign-in time' },
      { key: 'email', label: 'Email' },
      { key: 'locationLine', label: 'Location summary' },
      { key: 'ipAddress', label: 'IP address' },
      { key: 'device', label: 'Device label' },
    ],
    sampleVars: {
      brandName: 'DORINC',
      name: 'Alex Rivera',
      when: 'Aug 10, 2026, 8:15 AM',
      email: 'alex@example.com',
      locationLine: 'Near Philadelphia, PA',
      ipAddress: '203.0.113.10',
      device: 'iPhone - Safari',
      appUrl: 'https://app.example.com',
    },
  },
  {
    typeKey: 'outside_geofence_verification',
    name: 'Outside-area verification',
    description: '6-digit code when accessing from outside the service area.',
    audience: 'staff',
    group: 'security',
    defaults: {
      body: [
        'Your code is {{code}}',
        'Expires in {{expiresMinutes}} min',
        '{{locationLabel}}',
      ].join('\n'),
    },
    variables: [
      ...brandVars,
      { key: 'code', label: 'Verification code' },
      { key: 'expiresMinutes', label: 'Minutes until expiry' },
      { key: 'name', label: 'User name' },
      { key: 'locationLabel', label: 'Location' },
      { key: 'ipAddress', label: 'IP address' },
    ],
    sampleVars: {
      brandName: 'DORINC',
      code: '482913',
      expiresMinutes: '15',
      name: 'Alex Rivera',
      locationLabel: 'Austin, TX',
      ipAddress: '203.0.113.10',
      appUrl: 'https://app.example.com',
    },
  },
  {
    typeKey: 'signup_verification',
    name: 'Signup verification',
    description: 'Code or link notice after creating an account.',
    audience: 'staff',
    group: 'security',
    defaults: {
      body: [
        'Verify your email to finish signup.',
        'The link expires in 24 hours.',
      ].join('\n'),
    },
    variables: [
      ...brandVars,
      { key: 'name', label: 'User name' },
      { key: 'verifyUrl', label: 'Verification URL' },
    ],
    sampleVars: {
      brandName: 'DORINC',
      name: 'Alex Rivera',
      verifyUrl: 'https://app.example.com/auth/verify',
      appUrl: 'https://app.example.com',
    },
  },
  {
    typeKey: 'chat_message_received',
    name: 'Team / chat message',
    description: 'Notify staff of a new team or direct message.',
    audience: 'staff',
    group: 'workflow',
    defaults: {
      body: '{{senderName}} · {{channelLabel}}\n{{messagePreview}}{{photoNote}}',
    },
    variables: [
      ...brandVars,
      { key: 'senderName', label: 'Sender name' },
      { key: 'channelLabel', label: 'Channel label' },
      { key: 'messagePreview', label: 'Full message body' },
      { key: 'photoNote', label: 'Photo note' },
      { key: 'messagesUrl', label: 'Messages URL' },
      { key: 'recipientName', label: 'Recipient name' },
    ],
    sampleVars: {
      brandName: 'DORINC',
      senderName: 'Jordan',
      channelLabel: 'Team chat',
      messagePreview: 'Bus 40 is ready for pickup.',
      photoNote: '',
      messagesUrl: 'https://app.example.com/messages',
      recipientName: 'Alex',
      appUrl: 'https://app.example.com',
    },
  },
  {
    typeKey: 'password_reset',
    name: 'Password reset',
    description: 'Password reset notice with link.',
    audience: 'staff',
    group: 'security',
    defaults: {
      body: [
        'Password reset requested.',
        'Check email for the link (1 hour).',
      ].join('\n'),
    },
    variables: [
      ...brandVars,
      { key: 'name', label: 'User name' },
      { key: 'resetUrl', label: 'Reset URL' },
    ],
    sampleVars: {
      brandName: 'DORINC',
      name: 'Alex Rivera',
      resetUrl: 'https://app.example.com/auth/reset',
      appUrl: 'https://app.example.com',
    },
  },
  {
    typeKey: 'staff_invite',
    name: 'Staff invite',
    description: 'Invite with temporary credentials notice.',
    audience: 'staff',
    group: 'security',
    defaults: {
      body: [
        'You\'re invited',
        '{{email}}',
        'Temp password: {{tempPassword}}',
        'Expires in 7 days',
      ].join('\n'),
    },
    variables: [
      ...brandVars,
      { key: 'name', label: 'User name' },
      { key: 'email', label: 'Email' },
      { key: 'loginUrl', label: 'Login URL' },
      { key: 'tempPassword', label: 'Temporary password' },
    ],
    sampleVars: {
      brandName: 'DORINC',
      name: 'Alex Rivera',
      email: 'alex@example.com',
      loginUrl: 'https://app.example.com/auth/login',
      tempPassword: 'Temp-Example-1',
      appUrl: 'https://app.example.com',
    },
  },
  {
    typeKey: 'staff_password_reset',
    name: 'Staff password reset',
    description: 'Admin-issued temporary password notice.',
    audience: 'staff',
    group: 'security',
    defaults: {
      body: [
        'Password reset',
        '{{email}}',
        'Temp password: {{tempPassword}}',
        'Expires in 7 days',
      ].join('\n'),
    },
    variables: [
      ...brandVars,
      { key: 'name', label: 'User name' },
      { key: 'email', label: 'Email' },
      { key: 'loginUrl', label: 'Login URL' },
      { key: 'tempPassword', label: 'Temporary password' },
    ],
    sampleVars: {
      brandName: 'DORINC',
      name: 'Alex Rivera',
      email: 'alex@example.com',
      loginUrl: 'https://app.example.com/auth/login',
      tempPassword: 'Temp-Example-1',
      appUrl: 'https://app.example.com',
    },
  },
  {
    typeKey: 'deletion_request_submitted',
    name: 'Deletion request submitted',
    description: 'Reviewers are notified of a new deletion request.',
    audience: 'staff',
    group: 'workflow',
    defaults: {
      body: [
        'Delete request · {{entityTypeLabel}}',
        '{{entityLabel}}',
        '{{submitterName}} · {{reason}}',
      ].join('\n'),
    },
    variables: [
      ...brandVars,
      { key: 'submitterName', label: 'Submitter name' },
      { key: 'entityTypeLabel', label: 'Entity type' },
      { key: 'entityLabel', label: 'Entity label' },
      { key: 'reason', label: 'Reason' },
      { key: 'reviewUrl', label: 'Review URL' },
      { key: 'reviewerName', label: 'Reviewer name' },
    ],
    sampleVars: {
      brandName: 'DORINC',
      submitterName: 'Jordan',
      entityTypeLabel: 'Invoice',
      entityLabel: 'INV-000711',
      reason: 'Duplicate invoice created in error.',
      reviewUrl: 'https://app.example.com/deletion-requests',
      reviewerName: 'Alex',
      appUrl: 'https://app.example.com',
    },
  },
  {
    typeKey: 'deletion_request_result',
    name: 'Deletion request result',
    description: 'Requestor is notified when a deletion request is approved, rejected, or left for human review.',
    audience: 'staff',
    group: 'workflow',
    defaults: {
      body: [
        'Delete request {{statusLabel}}',
        '{{entityTypeLabel}} · {{entityLabel}}',
        '{{reviewedByName}}',
        '{{reviewReason}}',
      ].join('\n'),
    },
    variables: [
      ...brandVars,
      { key: 'entityTypeLabel', label: 'Entity type' },
      { key: 'entityLabel', label: 'Entity label' },
      { key: 'statusLabel', label: 'Status label' },
      { key: 'reviewedByName', label: 'Reviewed by' },
      { key: 'reviewReason', label: 'Reviewer note' },
      { key: 'detailLine', label: 'Detail line' },
      { key: 'requestorName', label: 'Requestor name' },
    ],
    sampleVars: {
      brandName: 'DORINC',
      entityTypeLabel: 'Invoice',
      entityLabel: 'INV-000711',
      statusLabel: 'Approved',
      reviewedByName: 'Alex',
      reviewReason: 'Confirmed duplicate.',
      detailLine: '',
      requestorName: 'Jordan',
      appUrl: 'https://app.example.com',
    },
  },
  {
    typeKey: 'user_signup_pending',
    name: 'Signup pending approval',
    description: 'Admins are notified when a signup needs approval.',
    audience: 'staff',
    group: 'workflow',
    defaults: {
      body: [
        'Signup needs approval',
        '{{userName}}',
        '{{userEmail}}',
      ].join('\n'),
    },
    variables: [
      ...brandVars,
      { key: 'userName', label: 'User name' },
      { key: 'userEmail', label: 'User email' },
      { key: 'usersUrl', label: 'Users URL' },
      { key: 'adminName', label: 'Admin name' },
    ],
    sampleVars: {
      brandName: 'DORINC',
      userName: 'Alex Rivera',
      userEmail: 'alex@example.com',
      usersUrl: 'https://app.example.com/users',
      adminName: 'Pat',
      appUrl: 'https://app.example.com',
    },
  },
  {
    typeKey: 'invoice_pending_approval',
    name: 'Invoice pending approval',
    description: 'Approvers are notified when an invoice needs review.',
    audience: 'staff',
    group: 'workflow',
    defaults: {
      body: [
        'Invoice needs approval',
        '{{invoiceNumber}} · {{customerName}}',
        '{{total}}',
      ].join('\n'),
    },
    variables: [
      ...brandVars,
      { key: 'invoiceNumber', label: 'Invoice number' },
      { key: 'customerName', label: 'Customer name' },
      { key: 'total', label: 'Total' },
      { key: 'invoiceUrl', label: 'Invoice URL' },
      { key: 'approverName', label: 'Approver name' },
    ],
    sampleVars: {
      brandName: 'DORINC',
      invoiceNumber: 'INV-000711',
      customerName: 'Fleet Co',
      total: '$1,240.00',
      invoiceUrl: 'https://app.example.com/invoices/1',
      approverName: 'Alex',
      appUrl: 'https://app.example.com',
    },
  },
  {
    typeKey: 'customer_service_request_staff',
    name: 'Customer service request',
    description: 'Staff are notified of a new portal service request.',
    audience: 'staff',
    group: 'workflow',
    defaults: {
      body: [
        'Service request · {{customerName}}',
        '{{vehicleUnit}} · {{serviceCategory}} · {{urgency}}',
        '{{message}}',
      ].join('\n'),
    },
    variables: [
      ...brandVars,
      { key: 'customerName', label: 'Customer name' },
      { key: 'vehicleUnit', label: 'Vehicle unit' },
      { key: 'vehicleDetails', label: 'Vehicle details' },
      { key: 'serviceCategory', label: 'Category' },
      { key: 'urgency', label: 'Urgency' },
      { key: 'message', label: 'Customer message' },
      { key: 'detailUrl', label: 'Detail URL' },
      { key: 'recipientName', label: 'Recipient name' },
    ],
    sampleVars: {
      brandName: 'DORINC',
      customerName: 'Fleet Co',
      vehicleUnit: 'Bus 40',
      vehicleDetails: '2018 Thomas Saf-T-Liner',
      serviceCategory: 'Brakes',
      urgency: 'High',
      message: 'Squealing on stop. Needs inspection today.',
      detailUrl: 'https://app.example.com/service-logs/1',
      recipientName: 'Alex',
      appUrl: 'https://app.example.com',
    },
  },
  {
    typeKey: 'customer_change_request_staff',
    name: 'Customer change request',
    description: 'Accounting staff are notified of a portal change request.',
    audience: 'staff',
    group: 'workflow',
    defaults: {
      body: [
        '{{requestKindLabel}} · {{customerName}}',
        '{{topic}}',
        '{{message}}',
      ].join('\n'),
    },
    variables: [
      ...brandVars,
      { key: 'requestKindLabel', label: 'Request kind' },
      { key: 'customerName', label: 'Customer name' },
      { key: 'topic', label: 'Topic' },
      { key: 'invoiceNumber', label: 'Invoice number' },
      { key: 'vehicleLabel', label: 'Vehicle label' },
      { key: 'message', label: 'Customer message' },
      { key: 'detailUrl', label: 'Detail URL' },
      { key: 'recipientName', label: 'Recipient name' },
    ],
    sampleVars: {
      brandName: 'DORINC',
      requestKindLabel: 'Billing correction request',
      customerName: 'Fleet Co',
      topic: 'Wrong labor hours',
      invoiceNumber: 'INV-000711',
      vehicleLabel: 'Bus 40',
      message: 'Please correct billed hours from 4 to 2.',
      detailUrl: 'https://app.example.com/portal-requests',
      recipientName: 'Alex',
      appUrl: 'https://app.example.com',
    },
  },
  {
    typeKey: 'customer_email_received_staff',
    name: 'Customer email received',
    description: 'Staff are notified when a customer email lands in Messages.',
    audience: 'staff',
    group: 'workflow',
    defaults: {
      body: [
        'Email from {{customerName}}',
        '{{subject}}',
        '{{messagePreview}}',
      ].join('\n'),
    },
    variables: [
      ...brandVars,
      { key: 'customerName', label: 'Customer name' },
      { key: 'customerEmail', label: 'Customer email' },
      { key: 'subject', label: 'Subject' },
      { key: 'messagePreview', label: 'Message body' },
      { key: 'messagesUrl', label: 'Messages URL' },
      { key: 'recipientName', label: 'Recipient name' },
    ],
    sampleVars: {
      brandName: 'DORINC',
      customerName: 'Fleet Co',
      customerEmail: 'ops@fleet.example',
      subject: 'Pickup window',
      messagePreview: 'Can we move pickup to 2pm?',
      messagesUrl: 'https://app.example.com/messages',
      recipientName: 'Alex',
      appUrl: 'https://app.example.com',
    },
  },
  {
    typeKey: 'daily_summary_report',
    name: 'Daily summary',
    description: 'Notice that the daily ops summary is ready (full report stays in email).',
    audience: 'staff',
    group: 'workflow',
    defaults: {
      body: 'Daily summary for {{reportDateLabel}} is ready.',
    },
    variables: [
      ...brandVars,
      { key: 'reportDateLabel', label: 'Report date' },
      { key: 'summaryUrl', label: 'Summary URL' },
      { key: 'recipientName', label: 'Recipient name' },
    ],
    sampleVars: {
      brandName: 'DORINC',
      reportDateLabel: 'Aug 10, 2026',
      summaryUrl: 'https://app.example.com/dashboard',
      recipientName: 'Alex',
      appUrl: 'https://app.example.com',
    },
  },
  {
    typeKey: 'quo_test',
    name: 'Quo test message',
    description: 'Sent from Control Panel to verify Quo SMS delivery.',
    audience: 'system',
    group: 'system',
    defaults: {
      body: [
        'Quo SMS test',
        '{{sentAt}}',
      ].join('\n'),
    },
    variables: [
      ...brandVars,
      { key: 'sentAt', label: 'Sent timestamp' },
      { key: 'name', label: 'Recipient name' },
    ],
    sampleVars: {
      brandName: 'DORINC',
      sentAt: 'Aug 10, 2026 8:00 AM',
      name: 'Alex Rivera',
      appUrl: 'https://app.example.com',
    },
  },
]

export function smsTemplateByKey(typeKey: string): SmsTemplateDefinition | undefined {
  return SMS_TEMPLATE_CATALOG.find(t => t.typeKey === typeKey)
}

export function listSmsTemplateCatalog(): SmsTemplateDefinition[] {
  return SMS_TEMPLATE_CATALOG
}

/** Default bodies keyed by type — keep worker SMS_DEFAULT_BODIES in sync. */
export function smsCatalogDefaultBodies(): Record<string, string> {
  return Object.fromEntries(SMS_TEMPLATE_CATALOG.map(t => [t.typeKey, t.defaults.body]))
}
