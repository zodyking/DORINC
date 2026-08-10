/**
 * Catalog of transactional SMS templates for Quo.
 * Keep copy short and mobile-friendly (SMS segment limits).
 */

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
    typeKey: 'login_notification',
    name: 'Sign-in alert',
    description: 'Sent when a staff or portal account signs in.',
    audience: 'staff',
    group: 'security',
    defaults: {
      body: '{{brandName}}: New sign-in for {{name}}. {{locationLine}} If this wasn\'t you, reset your password in the app.',
    },
    variables: [
      ...brandVars,
      { key: 'name', label: 'User name' },
      { key: 'locationLine', label: 'Location summary' },
      { key: 'ipAddress', label: 'IP address' },
      { key: 'device', label: 'Device label' },
    ],
    sampleVars: {
      brandName: 'DORINC',
      name: 'Alex Rivera',
      locationLine: 'Near Philadelphia, PA.',
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
      body: '{{brandName}} verification code: {{code}}. Expires in {{expiresMinutes}} min. Do not share this code.',
    },
    variables: [
      ...brandVars,
      { key: 'code', label: 'Verification code' },
      { key: 'expiresMinutes', label: 'Minutes until expiry' },
      { key: 'name', label: 'User name' },
    ],
    sampleVars: {
      brandName: 'DORINC',
      code: '482913',
      expiresMinutes: '15',
      name: 'Alex Rivera',
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
      body: '{{brandName}}: Confirm your account for {{name}}. Open {{verifyUrl}} to verify your email.',
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
      body: '{{brandName}}: {{senderName}} in {{channelLabel}}: "{{messagePreview}}" — {{messagesUrl}}',
    },
    variables: [
      ...brandVars,
      { key: 'senderName', label: 'Sender name' },
      { key: 'channelLabel', label: 'Channel label' },
      { key: 'messagePreview', label: 'Message preview' },
      { key: 'messagesUrl', label: 'Messages URL' },
      { key: 'recipientName', label: 'Recipient name' },
    ],
    sampleVars: {
      brandName: 'DORINC',
      senderName: 'Jordan',
      channelLabel: 'Team chat',
      messagePreview: 'Bus 40 is ready for pickup.',
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
      body: '{{brandName}}: Reset your password here: {{resetUrl}} (expires soon). Ignore if you didn\'t request this.',
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
      body: '{{brandName}}: You\'re invited, {{name}}. Sign in at {{loginUrl}} as {{email}}. Temp password: {{tempPassword}}. Change it after login.',
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
      body: '{{brandName}}: Password reset for {{name}}. Temp password: {{tempPassword}}. Sign in at {{loginUrl}} and change it immediately.',
    },
    variables: [
      ...brandVars,
      { key: 'name', label: 'User name' },
      { key: 'loginUrl', label: 'Login URL' },
      { key: 'tempPassword', label: 'Temporary password' },
    ],
    sampleVars: {
      brandName: 'DORINC',
      name: 'Alex Rivera',
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
      body: '{{brandName}}: Deletion request from {{submitterName}} for {{entityTypeLabel}} "{{entityLabel}}". Review: {{reviewUrl}}',
    },
    variables: [
      ...brandVars,
      { key: 'submitterName', label: 'Submitter name' },
      { key: 'entityTypeLabel', label: 'Entity type' },
      { key: 'entityLabel', label: 'Entity label' },
      { key: 'reviewUrl', label: 'Review URL' },
      { key: 'reviewerName', label: 'Reviewer name' },
    ],
    sampleVars: {
      brandName: 'DORINC',
      submitterName: 'Jordan',
      entityTypeLabel: 'Invoice',
      entityLabel: 'INV-000711',
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
      body: '{{brandName}}: Your deletion request for {{entityTypeLabel}} "{{entityLabel}}" was {{status}}. {{detailLine}}',
    },
    variables: [
      ...brandVars,
      { key: 'entityTypeLabel', label: 'Entity type' },
      { key: 'entityLabel', label: 'Entity label' },
      { key: 'status', label: 'Status' },
      { key: 'detailLine', label: 'Detail line' },
      { key: 'requestorName', label: 'Requestor name' },
    ],
    sampleVars: {
      brandName: 'DORINC',
      entityTypeLabel: 'Invoice',
      entityLabel: 'INV-000711',
      status: 'approved',
      detailLine: 'Reviewed by Alex.',
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
      body: '{{brandName}}: {{userName}} ({{userEmail}}) requested access. Review: {{usersUrl}}',
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
      body: '{{brandName}}: Invoice {{invoiceNumber}} for {{customerName}} ({{total}}) needs approval. {{invoiceUrl}}',
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
      body: '{{brandName}}: Service request from {{customerName}} — {{vehicleUnit}} ({{urgency}}). {{detailUrl}}',
    },
    variables: [
      ...brandVars,
      { key: 'customerName', label: 'Customer name' },
      { key: 'vehicleUnit', label: 'Vehicle unit' },
      { key: 'urgency', label: 'Urgency' },
      { key: 'detailUrl', label: 'Detail URL' },
      { key: 'recipientName', label: 'Recipient name' },
    ],
    sampleVars: {
      brandName: 'DORINC',
      customerName: 'Fleet Co',
      vehicleUnit: 'Bus 40',
      urgency: 'High',
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
      body: '{{brandName}}: {{requestKindLabel}} from {{customerName}}: {{topic}}. {{detailUrl}}',
    },
    variables: [
      ...brandVars,
      { key: 'requestKindLabel', label: 'Request kind' },
      { key: 'customerName', label: 'Customer name' },
      { key: 'topic', label: 'Topic' },
      { key: 'detailUrl', label: 'Detail URL' },
      { key: 'recipientName', label: 'Recipient name' },
    ],
    sampleVars: {
      brandName: 'DORINC',
      requestKindLabel: 'Billing correction request',
      customerName: 'Fleet Co',
      topic: 'Wrong labor hours',
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
      body: '{{brandName}}: Email from {{customerName}} <{{customerEmail}}>: "{{subject}}". {{messagesUrl}}',
    },
    variables: [
      ...brandVars,
      { key: 'customerName', label: 'Customer name' },
      { key: 'customerEmail', label: 'Customer email' },
      { key: 'subject', label: 'Subject' },
      { key: 'messagesUrl', label: 'Messages URL' },
      { key: 'recipientName', label: 'Recipient name' },
    ],
    sampleVars: {
      brandName: 'DORINC',
      customerName: 'Fleet Co',
      customerEmail: 'ops@fleet.example',
      subject: 'Pickup window',
      messagesUrl: 'https://app.example.com/messages',
      recipientName: 'Alex',
      appUrl: 'https://app.example.com',
    },
  },
  {
    typeKey: 'daily_summary_report',
    name: 'Daily summary',
    description: 'Short notice that the daily ops summary is ready.',
    audience: 'staff',
    group: 'workflow',
    defaults: {
      body: '{{brandName}}: Daily summary for {{reportDateLabel}} is ready. Open: {{summaryUrl}}',
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
      body: '{{brandName}}: Quo SMS test OK at {{sentAt}}.',
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
