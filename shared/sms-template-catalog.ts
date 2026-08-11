/**
 * Catalog of transactional SMS templates for Quo.
 * Defaults mirror the email notification workflow with stacked fields:
 * label on its own line, value on the next, blank line between fields.
 * Keep bodies within Quo's 1600-character send limit.
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

/** Stack field label above value; blank line between field pairs. */
export function smsStackedFields(pairs: Array<[string, string]>): string[] {
  const lines: string[] = []
  for (let i = 0; i < pairs.length; i++) {
    const [label, value] = pairs[i]!
    lines.push(label, value)
    if (i < pairs.length - 1) lines.push('')
  }
  return lines
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
      body: [
        '{{brandName}}',
        '',
        'Hi {{name}},',
        '',
        'Notification channel updated',
        '',
        '{{leadMessage}}',
        '',
        '{{detailMessage}}',
        '',
        'Open: {{accountUrl}}',
      ].join('\n'),
    },
    variables: [
      ...brandVars,
      { key: 'name', label: 'User name' },
      { key: 'channelLabel', label: 'Channel label' },
      { key: 'leadMessage', label: 'Lead message' },
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
    description: 'Sent when Text notifications are enabled so the user can save the Dorinc / Susan AI contact on iPhone.',
    audience: 'staff',
    group: 'security',
    defaults: {
      body: [
        '{{brandName}}',
        '',
        'Hi {{name}},',
        '',
        'Save the Dorinc contact to text Susan anytime:',
        '{{contactUrl}}',
        '',
        'Susan AI helps with platform questions. In future updates she will also be able to send invoices, reply to customer emails, and manage basic platform duties.',
      ].join('\n'),
    },
    variables: [
      ...brandVars,
      { key: 'name', label: 'User name' },
      { key: 'contactUrl', label: 'vCard download URL' },
    ],
    sampleVars: {
      brandName: 'DORINC',
      name: 'Alex Rivera',
      contactUrl: 'https://app.example.com/api/public/dorinc-contact.vcf',
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
        '{{brandName}}',
        '',
        'Hi {{name}},',
        '',
        'New sign-in',
        '',
        'Your staff account was used to sign in to {{brandName}}.',
        '',
        ...smsStackedFields([
          ['When', '{{when}}'],
          ['Email', '{{email}}'],
          ['Location', '{{locationLine}}'],
          ['IP address', '{{ipAddress}}'],
          ['Device', '{{device}}'],
        ]),
        '',
        'If this was not you, contact your administrator immediately and change your password.',
        'Open: {{appUrl}}',
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
        '{{brandName}}',
        '',
        'Hi {{name}},',
        '',
        'Suspicious location detected',
        '',
        'You\'re accessing {{brandName}} from a suspicious location. Enter this verification code to confirm your identity.',
        '',
        ...smsStackedFields([
          ['Verification code', '{{code}}'],
          ['Expires', '{{expiresMinutes}} minutes'],
          ['Location', '{{locationLabel}}'],
          ['IP address', '{{ipAddress}}'],
        ]),
        '',
        'If you did not attempt to sign in, contact your administrator immediately and change your password.',
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
        '{{brandName}}',
        '',
        'Hi {{name}},',
        '',
        'Verify your email',
        '',
        'Confirm your email to continue your {{brandName}} account request.',
        '',
        'Open: {{verifyUrl}}',
        '',
        'The link expires in 24 hours. After verification an administrator must approve your account before you can sign in.',
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
      body: [
        '{{brandName}}',
        '',
        'Hi {{recipientName}},',
        '',
        '{{senderName}} sent a message',
        '',
        'You received a new message in {{channelLabel}}.',
        '',
        '{{messagePreview}}',
        '',
        '{{photoNote}}Open: {{messagesUrl}}',
      ].join('\n'),
    },
    variables: [
      ...brandVars,
      { key: 'senderName', label: 'Sender name' },
      { key: 'channelLabel', label: 'Channel label' },
      { key: 'messagePreview', label: 'Full message body' },
      { key: 'photoNote', label: 'Photo note (include trailing newlines when set)' },
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
        '{{brandName}}',
        '',
        'Hi {{name}},',
        '',
        'Reset your password',
        '',
        'We received a request to reset your {{brandName}} staff password.',
        '',
        'Open: {{resetUrl}}',
        '',
        'The link expires in 1 hour. If you did not request this, you can ignore this message — your password will not change unless you use the link.',
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
        '{{brandName}}',
        '',
        'Hello {{name}},',
        '',
        'Welcome to the team',
        '',
        'You\'ve been invited to join the {{brandName}} staff workspace. Sign in with the credentials below, then choose your own password.',
        '',
        ...smsStackedFields([
          ['Email', '{{email}}'],
          ['Temporary password', '{{tempPassword}}'],
        ]),
        '',
        'Open: {{loginUrl}}',
        '',
        'Your email is already verified. Choose a new password when you sign in for the first time.',
        'This temporary password expires in 7 days.',
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
        '{{brandName}}',
        '',
        'Hello {{name}},',
        '',
        'Password reset',
        '',
        'An administrator reset your {{brandName}} staff password. Sign in with the temporary password below, then choose a new one.',
        '',
        ...smsStackedFields([
          ['Email', '{{email}}'],
          ['Temporary password', '{{tempPassword}}'],
        ]),
        '',
        'Open: {{loginUrl}}',
        '',
        'After any required login messages, you will be asked to choose a new password before continuing.',
        'This temporary password expires in 7 days.',
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
        '{{brandName}}',
        '',
        'Hi {{reviewerName}},',
        '',
        'Deletion request',
        '',
        '{{submitterName}} requested deletion of a {{entityTypeLabel}}.',
        '',
        ...smsStackedFields([
          ['Record', '{{entityLabel}}'],
          ['Type', '{{entityTypeLabel}}'],
          ['Requested by', '{{submitterName}}'],
          ['Reason for deletion', '{{reason}}'],
        ]),
        '',
        'Open: {{reviewUrl}}',
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
    description: 'Requestor is notified when a deletion request is approved or rejected.',
    audience: 'staff',
    group: 'workflow',
    defaults: {
      body: [
        '{{brandName}}',
        '',
        'Hi {{requestorName}},',
        '',
        'Deletion request',
        '',
        'Your deletion request for {{entityTypeLabel}} "{{entityLabel}}" has been reviewed.',
        '',
        ...smsStackedFields([
          ['Record', '{{entityLabel}}'],
          ['Type', '{{entityTypeLabel}}'],
          ['Decision', '{{statusLabel}}'],
          ['Reviewed by', '{{reviewedByName}}'],
          ['Reviewer note', '{{reviewReason}}'],
        ]),
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
        '{{brandName}}',
        '',
        'Hi {{adminName}},',
        '',
        'New user awaiting approval',
        '',
        'A staff signup finished email verification and needs an administrator to approve the account.',
        '',
        ...smsStackedFields([
          ['Name', '{{userName}}'],
          ['Email', '{{userEmail}}'],
          ['Status', 'Pending approval'],
        ]),
        '',
        'Open: {{usersUrl}}',
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
        '{{brandName}}',
        '',
        'Hi {{approverName}},',
        '',
        'Invoice needs approval',
        '',
        'Invoice {{invoiceNumber}} for {{customerName}} is waiting for manager approval.',
        '',
        ...smsStackedFields([
          ['Invoice', '{{invoiceNumber}}'],
          ['Customer', '{{customerName}}'],
          ['Total', '{{total}}'],
        ]),
        '',
        'Open: {{invoiceUrl}}',
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
        '{{brandName}}',
        '',
        'Hi {{recipientName}},',
        '',
        'New customer service request',
        '',
        '{{customerName}} submitted a service request. Check the portal for full details and next steps.',
        '',
        ...smsStackedFields([
          ['Customer', '{{customerName}}'],
          ['Vehicle', '{{vehicleUnit}}'],
          ['Details', '{{vehicleDetails}}'],
          ['Category', '{{serviceCategory}}'],
          ['Urgency', '{{urgency}}'],
          ['Customer message', '{{message}}'],
        ]),
        '',
        'Open: {{detailUrl}}',
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
        '{{brandName}}',
        '',
        'Hi {{recipientName}},',
        '',
        'New customer change request',
        '',
        '{{customerName}} submitted a {{requestKindLabel}}.',
        '',
        ...smsStackedFields([
          ['Customer', '{{customerName}}'],
          ['Request type', '{{requestKindLabel}}'],
          ['Topic', '{{topic}}'],
          ['Invoice', '{{invoiceNumber}}'],
          ['Vehicle', '{{vehicleLabel}}'],
          ['Customer message', '{{message}}'],
        ]),
        '',
        'Open: {{detailUrl}}',
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
        '{{brandName}}',
        '',
        'Hi {{recipientName}},',
        '',
        '{{customerName}} sent a message',
        '',
        '{{customerName}} emailed your company inbox. Sign in, open Messages, and reply.',
        '',
        ...smsStackedFields([
          ['Customer', '{{customerName}}'],
          ['Email', '{{customerEmail}}'],
          ['Subject', '{{subject}}'],
          ['Message', '{{messagePreview}}'],
        ]),
        '',
        'Open: {{messagesUrl}}',
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
      body: [
        '{{brandName}}',
        '',
        'Hi {{recipientName}},',
        '',
        'Daily summary',
        '',
        'Stats for {{reportDateLabel}} are ready, with notes from Susan AI Assistant under each section.',
        '',
        ...smsStackedFields([
          ['Report date', '{{reportDateLabel}}'],
        ]),
        '',
        'Open: {{summaryUrl}}',
      ].join('\n'),
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
        '{{brandName}}',
        '',
        'Hi {{name}},',
        '',
        'Quo SMS test successful',
        '',
        'This is a test message from the {{brandName}} control panel.',
        '',
        ...smsStackedFields([
          ['Sent at', '{{sentAt}}'],
        ]),
        '',
        'If you received this, outbound Quo SMS is working correctly.',
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
