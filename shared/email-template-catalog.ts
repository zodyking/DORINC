/**
 * Catalog of transactional email types and editable content defaults.
 * Placeholders use {{variable}} syntax (e.g. {{name}}, {{brandName}}).
 */

export interface EmailTemplateContent {
  subject: string
  eyebrow: string
  headline: string
  lead: string
  noteTitle: string
  noteBody: string
  primaryActionLabel: string
  /**
   * Raw HTML email document. When non-empty on an active template, replaces the
   * generated layout HTML ({{variables}} are interpolated at send/preview time).
   */
  htmlSource: string
}

export type EmailTemplateAudience = 'customer' | 'staff' | 'system'
export type EmailTemplateGroup = 'security' | 'customer' | 'workflow' | 'system'

export interface EmailTemplateVariable {
  key: string
  label: string
}

export interface EmailTemplateDefinition {
  typeKey: string
  name: string
  description: string
  audience: EmailTemplateAudience
  group: EmailTemplateGroup
  defaults: EmailTemplateContent
  variables: EmailTemplateVariable[]
  /** Sample values used for preview rendering. */
  sampleVars: Record<string, string>
}

export function emptyEmailTemplateContent(): EmailTemplateContent {
  return {
    subject: '',
    eyebrow: '',
    headline: '',
    lead: '',
    noteTitle: '',
    noteBody: '',
    primaryActionLabel: '',
    htmlSource: '',
  }
}

export function normalizeEmailTemplateContent(
  input: Partial<EmailTemplateContent> | null | undefined,
  fallback: EmailTemplateContent,
): EmailTemplateContent {
  return {
    subject: String(input?.subject ?? fallback.subject).trim() || fallback.subject,
    eyebrow: String(input?.eyebrow ?? fallback.eyebrow).trim() || fallback.eyebrow,
    headline: String(input?.headline ?? fallback.headline).trim() || fallback.headline,
    lead: String(input?.lead ?? fallback.lead).trim() || fallback.lead,
    noteTitle: String(input?.noteTitle ?? fallback.noteTitle ?? '').trim(),
    noteBody: String(input?.noteBody ?? fallback.noteBody ?? '').trim(),
    primaryActionLabel: String(input?.primaryActionLabel ?? fallback.primaryActionLabel).trim()
      || fallback.primaryActionLabel,
    htmlSource: String(input?.htmlSource ?? fallback.htmlSource ?? '').trim(),
  }
}

/** Replace {{var}} tokens. Unknown keys become empty strings. */
export function interpolateEmailTemplate(template: string, vars: Record<string, string | null | undefined>): string {
  return String(template ?? '').replace(/\{\{\s*([\w.]+)\s*\}\}/g, (_, key: string) => {
    const value = vars[key]
    return value == null ? '' : String(value)
  })
}

export function applyEmailTemplateContent(
  content: EmailTemplateContent,
  vars: Record<string, string | null | undefined>,
): EmailTemplateContent {
  return {
    subject: interpolateEmailTemplate(content.subject, vars),
    eyebrow: interpolateEmailTemplate(content.eyebrow, vars),
    headline: interpolateEmailTemplate(content.headline, vars),
    lead: interpolateEmailTemplate(content.lead, vars),
    noteTitle: interpolateEmailTemplate(content.noteTitle, vars),
    noteBody: interpolateEmailTemplate(content.noteBody, vars),
    primaryActionLabel: interpolateEmailTemplate(content.primaryActionLabel, vars),
    htmlSource: interpolateEmailTemplate(content.htmlSource ?? '', vars),
  }
}

/** True when a saved template uses a custom raw HTML document. */
export function hasEmailTemplateHtmlSource(
  content: Partial<EmailTemplateContent> | null | undefined,
): boolean {
  return Boolean(content?.htmlSource && String(content.htmlSource).trim())
}

const v = (key: string, label: string): EmailTemplateVariable => ({ key, label })

/** Never show these as labeled detail rows — brand is in the header; URLs are CTAs. */
const EMAIL_PREVIEW_DETAIL_OMIT_KEYS = new Set([
  'brandName',
  'brandLegal',
  'verifyUrl',
  'resetUrl',
  'detailUrl',
  'messagesUrl',
  'invoiceUrl',
  'reviewUrl',
  'usersUrl',
  'loginUrl',
  // Interpolation-only helpers (not reader-facing fields)
  'statusWord',
  'statusWordLower',
  'kindLabelLower',
  'requestKindLabelLower',
  'entityTypeLabelLower',
  'statusLabelTitle',
  'leadMessage',
  'noteBody',
])

const EMAIL_FIELD_LABEL_OVERRIDES: Record<string, string> = {
  tempPassword: 'Temporary Password',
  brandName: 'Business Name',
  ipAddress: 'IP Address',
  resetUrl: 'Reset Link',
  verifyUrl: 'Verification Link',
}

/**
 * Convert a camelCase/snake_case key (or loose label) into Title Case words.
 */
export function titleCaseEmailFieldLabel(keyOrLabel: string): string {
  const override = EMAIL_FIELD_LABEL_OVERRIDES[keyOrLabel]
  if (override) return override

  const spaced = String(keyOrLabel ?? '')
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/_+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
  if (!spaced) return ''

  const acronyms = new Set(['ip', 'url', 'id', 'pdf', 'smtp', 'html', 'cta'])
  return spaced.split(' ').map((word) => {
    return word.split('-').map((part) => {
      const lower = part.toLowerCase()
      if (acronyms.has(lower)) return lower.toUpperCase()
      if (!lower) return part
      return lower.charAt(0).toUpperCase() + lower.slice(1)
    }).join('-')
  }).join(' ')
}

/**
 * Build human-readable detail rows for Control Panel email previews.
 * Uses catalog labels (Title Case), omits brandName and CTA URLs.
 */
export function buildEmailTemplatePreviewDetails(
  def: Pick<EmailTemplateDefinition, 'variables' | 'sampleVars'>,
  vars: Record<string, string | null | undefined> = def.sampleVars,
  limit = 6,
): Array<{ label: string, value: string }> {
  const labelByKey = new Map(def.variables.map(item => [item.key, item.label]))
  const seen = new Set<string>()
  const rows: Array<{ label: string, value: string }> = []

  // Prefer catalog variable order so previews stay stable and intentional.
  const keys = [
    ...def.variables.map(item => item.key),
    ...Object.keys(vars),
  ]

  for (const key of keys) {
    if (seen.has(key)) continue
    seen.add(key)
    if (EMAIL_PREVIEW_DETAIL_OMIT_KEYS.has(key)) continue
    if (/Url$/i.test(key) || /Link$/i.test(key)) continue
    if (/Lower$/i.test(key)) continue

    const raw = vars[key]
    if (raw == null || String(raw).trim() === '') continue

    const catalogLabel = labelByKey.get(key)
    const label = EMAIL_FIELD_LABEL_OVERRIDES[key]
      || catalogLabel
      || titleCaseEmailFieldLabel(key)

    rows.push({ label, value: String(raw) })
    if (rows.length >= limit) break
  }

  return rows
}

export const EMAIL_TEMPLATE_CATALOG: EmailTemplateDefinition[] = [
  {
    typeKey: 'signup_verification',
    name: 'Signup verification',
    description: 'Sent when a staff member verifies their email during signup.',
    audience: 'staff',
    group: 'security',
    defaults: {
      subject: 'Verify Your Email',
      eyebrow: '',
      headline: 'Verify your email',
      lead: 'Confirm your email to continue your {{brandName}} account request.',
      noteTitle: 'What happens next',
      noteBody: 'After verification, an administrator must approve your account before you can sign in.',
      primaryActionLabel: 'Verify email address',
      htmlSource: '',
    },
    variables: [v('name', 'Name'), v('brandName', 'Business Name'), v('verifyUrl', 'Verification Link')],
    sampleVars: {
      name: 'Alex Morgan',
      brandName: 'Devon On Site Repairs',
      verifyUrl: 'https://app.example.com/auth/verify-email?token=sample',
    },
  },
  {
    typeKey: 'password_reset',
    name: 'Password reset',
    description: 'Staff password reset link email.',
    audience: 'staff',
    group: 'security',
    defaults: {
      subject: 'Reset Your Password',
      eyebrow: '',
      headline: 'Reset your password',
      lead: 'Use the button below to choose a new password for your {{brandName}} staff account.',
      noteTitle: 'Did not request this?',
      noteBody: 'You can safely ignore this email — your password will not change unless you use the link above.',
      primaryActionLabel: 'Reset password',
      htmlSource: '',
    },
    variables: [v('name', 'Name'), v('brandName', 'Business Name'), v('resetUrl', 'Reset Link')],
    sampleVars: {
      name: 'Alex Morgan',
      brandName: 'Devon On Site Repairs',
      resetUrl: 'https://app.example.com/auth/reset-password?token=sample',
    },
  },
  {
    typeKey: 'outside_geofence_verification',
    name: 'Suspicious location verification',
    description: 'Verification code when signing in from outside the allowed area.',
    audience: 'staff',
    group: 'security',
    defaults: {
      subject: 'Verify Suspicious Location Access',
      eyebrow: '',
      headline: 'Suspicious location detected',
      lead: 'You\'re accessing {{brandName}} from a suspicious location. Enter this verification code to confirm your identity.',
      noteTitle: 'Was this not you?',
      noteBody: 'If you did not attempt to sign in, contact your administrator immediately and change your password.',
      primaryActionLabel: 'Enter verification code',
      htmlSource: '',
    },
    variables: [
      v('name', 'Name'),
      v('brandName', 'Business Name'),
      v('code', 'Verification Code'),
      v('locationLabel', 'Location'),
      v('ipAddress', 'IP Address'),
    ],
    sampleVars: {
      name: 'Alex Morgan',
      brandName: 'Devon On Site Repairs',
      code: '482913',
      locationLabel: 'Austin, TX',
      ipAddress: '203.0.113.10',
    },
  },
  {
    typeKey: 'smtp_test',
    name: 'SMTP test',
    description: 'Test message from Control Panel email settings.',
    audience: 'system',
    group: 'system',
    defaults: {
      subject: 'SMTP Test Successful',
      eyebrow: '',
      headline: 'SMTP test successful',
      lead: 'This is a test message from the {{brandName}} {{source}}.',
      noteTitle: 'Result',
      noteBody: 'If you received this email, outbound SMTP is working correctly.',
      primaryActionLabel: '',
      htmlSource: '',
    },
    variables: [
      v('brandName', 'Business Name'),
      v('source', 'Source'),
      v('actorName', 'Sent By'),
      v('sentAt', 'Sent At'),
    ],
    sampleVars: {
      brandName: 'Devon On Site Repairs',
      source: 'control panel',
      actorName: 'Jordan Lee',
      sentAt: 'Jul 9, 2026, 2:00 PM',
    },
  },
  {
    typeKey: 'portal_credentials',
    name: 'Portal credentials',
    description: 'Customer portal username and temporary password.',
    audience: 'customer',
    group: 'customer',
    defaults: {
      subject: 'Your Portal Access',
      eyebrow: '',
      headline: 'Customer Portal access',
      lead: 'A staff member has sent you access to the {{brandName}} Customer Portal. Use the button below to sign in.',
      noteTitle: 'Security note',
      noteBody: 'You will choose a new password on first login. If you did not expect this email, contact the shop that issued it.',
      primaryActionLabel: 'Sign in to the portal',
      htmlSource: '',
    },
    variables: [
      v('name', 'Customer Name'),
      v('brandName', 'Business Name'),
      v('username', 'Username'),
      v('tempPassword', 'Temporary Password'),
    ],
    sampleVars: {
      name: 'Pat Rivera',
      brandName: 'Devon On Site Repairs',
      username: 'northstar',
      tempPassword: 'TempPass1!',
    },
  },
  {
    typeKey: 'staff_invite',
    name: 'Staff invite',
    description: 'Invitation for a new staff workspace account.',
    audience: 'staff',
    group: 'security',
    defaults: {
      subject: 'You\'re invited to {{brandName}}',
      eyebrow: '',
      headline: 'Welcome to the team',
      lead: 'You\'ve been invited to join the {{brandName}} staff workspace. Sign in with the credentials below, then choose your own password.',
      noteTitle: 'First sign-in',
      noteBody: 'Use the temporary password once, then you will be prompted to create your own password. If you did not expect this invite, contact your administrator.',
      primaryActionLabel: 'Sign in to staff workspace',
      htmlSource: '',
    },
    variables: [
      v('name', 'Name'),
      v('brandName', 'Business Name'),
      v('email', 'Email'),
      v('tempPassword', 'Temporary Password'),
    ],
    sampleVars: {
      name: 'Casey Quinn',
      brandName: 'Devon On Site Repairs',
      email: 'casey@example.com',
      tempPassword: 'TempPass1!',
    },
  },
  {
    typeKey: 'backup_notification',
    name: 'Backup notification',
    description: 'Success or failure alert for database backups.',
    audience: 'system',
    group: 'system',
    defaults: {
      subject: 'Backup {{statusWord}} — {{filename}}',
      eyebrow: '',
      headline: 'Backup {{statusWordLower}}',
      lead: '{{leadMessage}}',
      noteTitle: 'Details',
      noteBody: '{{noteBody}}',
      primaryActionLabel: 'Open backup settings',
      htmlSource: '',
    },
    variables: [
      v('filename', 'Filename'),
      v('trigger', 'Trigger'),
      v('statusWord', 'Status'),
      v('statusWordLower', 'Status Lowercase'),
      v('leadMessage', 'Lead Message'),
      v('noteBody', 'Note Body'),
    ],
    sampleVars: {
      filename: 'dorinc-2026-07-09.enc',
      trigger: 'scheduled',
      statusWord: 'Completed',
      statusWordLower: 'completed',
      leadMessage: 'An encrypted database backup completed successfully.',
      noteBody: '',
    },
  },
  {
    typeKey: 'daily_summary_report',
    name: 'Daily summary report',
    description: 'Daily digest for admins and managers: invoices, Susan usage, inquiries, deletions, backups, disk, and ops billing, with a Susan note per section.',
    audience: 'staff',
    group: 'system',
    defaults: {
      subject: 'Daily Summary: {{reportDateLabel}}',
      eyebrow: '',
      headline: 'Daily summary: {{reportDateLabel}}',
      lead: 'Stats for {{reportDateLabel}}, with a short note from Susan AI Assistant under each section.',
      noteTitle: 'Susan AI Assistant',
      noteBody: '',
      primaryActionLabel: 'Reconcile invoices',
      htmlSource: '',
    },
    variables: [
      v('reportDateLabel', 'Report Date'),
      v('recipientName', 'Recipient Name'),
      v('outstandingTotal', 'Outstanding Total'),
      v('outstandingCount', 'Outstanding Count'),
      v('overdueCount', 'Overdue Count'),
      v('paidThisMonth', 'Paid This Month'),
    ],
    sampleVars: {
      reportDateLabel: 'Aug 7, 2026',
      recipientName: 'Alex Morgan',
      outstandingTotal: '$12,450.00',
      outstandingCount: '8',
      overdueCount: '2',
      paidThisMonth: '$4,200.00',
    },
  },
  {
    typeKey: 'invoice_attached',
    name: 'Invoice attached (PDF)',
    description: 'Customer email with invoice PDF attachment.',
    audience: 'customer',
    group: 'customer',
    defaults: {
      subject: 'Invoice {{invoiceNumber}} Is Ready',
      eyebrow: '',
      headline: 'Invoice {{invoiceNumber}}',
      lead: 'Hello {{recipientName}}, invoice {{invoiceNumber}} is attached to this email as a PDF.',
      noteTitle: 'Need help?',
      noteBody: 'If you have questions, reply to this email or submit a request through your customer portal.',
      primaryActionLabel: '',
      htmlSource: '',
    },
    variables: [
      v('recipientName', 'Customer Name'),
      v('invoiceNumber', 'Invoice Number'),
      v('dueDate', 'Due Date'),
      v('total', 'Total'),
    ],
    sampleVars: {
      recipientName: 'Pat Rivera',
      invoiceNumber: 'INV-1042',
      dueDate: 'Aug 15, 2026',
      total: '$1,250.00',
    },
  },
  {
    typeKey: 'invoice_sent',
    name: 'Invoice sent (portal)',
    description: 'Customer portal invoice-ready notification.',
    audience: 'customer',
    group: 'customer',
    defaults: {
      subject: 'Invoice {{invoiceNumber}} Is Ready',
      eyebrow: '',
      headline: 'Invoice {{invoiceNumber}}',
      lead: 'Invoice {{invoiceNumber}} has been sent and is available in your customer portal.',
      noteTitle: 'Need help?',
      noteBody: 'If you have questions, reply to this email or submit a request through the portal.',
      primaryActionLabel: 'View invoice in the portal',
      htmlSource: '',
    },
    variables: [
      v('recipientName', 'Customer Name'),
      v('invoiceNumber', 'Invoice Number'),
      v('dueDate', 'Due Date'),
      v('total', 'Total'),
    ],
    sampleVars: {
      recipientName: 'Pat Rivera',
      invoiceNumber: 'INV-1042',
      dueDate: 'Aug 15, 2026',
      total: '$1,250.00',
    },
  },
  {
    typeKey: 'estimate_sent',
    name: 'Estimate sent',
    description: 'Customer portal estimate-ready notification.',
    audience: 'customer',
    group: 'customer',
    defaults: {
      subject: 'Estimate {{estimateNumber}} Ready For Review',
      eyebrow: '',
      headline: 'Estimate {{estimateNumber}}',
      lead: 'Estimate {{estimateNumber}} is ready for your review in the customer portal.',
      noteTitle: '',
      noteBody: '',
      primaryActionLabel: 'View estimate in the portal',
      htmlSource: '',
    },
    variables: [
      v('recipientName', 'Customer Name'),
      v('estimateNumber', 'Estimate Number'),
    ],
    sampleVars: {
      recipientName: 'Pat Rivera',
      estimateNumber: 'EST-220',
    },
  },
  {
    typeKey: 'request_status',
    name: 'Portal request status',
    description: 'Customer notification when a portal request is approved or rejected.',
    audience: 'customer',
    group: 'customer',
    defaults: {
      subject: '{{kindLabel}} {{statusLabel}}',
      eyebrow: '',
      headline: 'Request {{statusLabel}}',
      lead: 'Your {{kindLabelLower}} "{{requestTitle}}" has been {{statusLabel}}.',
      noteTitle: 'Staff note',
      noteBody: '{{reviewReason}}',
      primaryActionLabel: 'View your requests',
      htmlSource: '',
    },
    variables: [
      v('recipientName', 'Customer Name'),
      v('kindLabel', 'Request Type'),
      v('kindLabelLower', 'Request Type Lowercase'),
      v('requestTitle', 'Request Title'),
      v('statusLabel', 'Status'),
      v('reviewReason', 'Staff Note'),
    ],
    sampleVars: {
      recipientName: 'Pat Rivera',
      kindLabel: 'Service request',
      kindLabelLower: 'service request',
      requestTitle: 'Brake inspection',
      statusLabel: 'Approved',
      reviewReason: 'Scheduled for Tuesday morning.',
    },
  },
  {
    typeKey: 'login_notification',
    name: 'Sign-in alert',
    description: 'Security alert when an account signs in.',
    audience: 'staff',
    group: 'security',
    defaults: {
      subject: 'New Sign-In Detected',
      eyebrow: '',
      headline: 'New sign-in',
      lead: 'Your staff account was used to sign in to {{brandName}}.',
      noteTitle: 'Was this you?',
      noteBody: 'If this was not you, contact your administrator immediately and change your password.',
      primaryActionLabel: 'Open {{brandName}}',
      htmlSource: '',
    },
    variables: [
      v('name', 'Name'),
      v('brandName', 'Business Name'),
      v('email', 'Email'),
      v('when', 'Sign-In Time'),
      v('ipAddress', 'IP Address'),
      v('device', 'Device'),
    ],
    sampleVars: {
      name: 'Alex Morgan',
      brandName: 'Devon On Site Repairs',
      email: 'alex@example.com',
      when: 'Jul 9, 2026, 2:00 PM',
      ipAddress: '203.0.113.10',
      device: 'Chrome on macOS',
    },
  },
  {
    typeKey: 'customer_auto_responder',
    name: 'Customer auto-responder',
    description: 'Automatic reply when a customer email is received.',
    audience: 'customer',
    group: 'customer',
    defaults: {
      subject: 'We received your message',
      eyebrow: '',
      headline: 'We got your email',
      lead: 'Hi {{recipientName}},',
      noteTitle: 'What happens next',
      noteBody: 'A member of the {{brandName}} team will review your message and reply as soon as possible.',
      primaryActionLabel: '',
      htmlSource: '',
    },
    variables: [
      v('recipientName', 'Customer Name'),
      v('brandName', 'Business Name'),
      v('subject', 'Original Subject'),
    ],
    sampleVars: {
      recipientName: 'Pat Rivera',
      brandName: 'Devon On Site Repairs',
      subject: 'Question about my invoice',
    },
  },
  {
    typeKey: 'deletion_request_submitted',
    name: 'Deletion request submitted',
    description: 'Notify reviewers when a deletion request is submitted.',
    audience: 'staff',
    group: 'workflow',
    defaults: {
      subject: 'Deletion Request — {{entityLabel}}',
      eyebrow: '',
      headline: 'Deletion request',
      lead: '{{submitterName}} requested deletion of a {{entityTypeLabelLower}}. Review the record and reason, then approve or deny.',
      noteTitle: 'Reason for deletion',
      noteBody: '{{reason}}',
      primaryActionLabel: 'Review request',
      htmlSource: '',
    },
    variables: [
      v('reviewerName', 'Reviewer Name'),
      v('submitterName', 'Submitter Name'),
      v('entityTypeLabel', 'Record Type'),
      v('entityTypeLabelLower', 'Record Type Lowercase'),
      v('entityLabel', 'Record'),
      v('reason', 'Reason'),
    ],
    sampleVars: {
      reviewerName: 'Jordan Lee',
      submitterName: 'Alex Morgan',
      entityTypeLabel: 'Customer',
      entityTypeLabelLower: 'customer',
      entityLabel: 'Northstar Logistics',
      reason: 'Duplicate record created in error.',
    },
  },
  {
    typeKey: 'deletion_request_result',
    name: 'Deletion request result',
    description: 'Notify the requestor when a deletion request is decided.',
    audience: 'staff',
    group: 'workflow',
    defaults: {
      subject: 'Deletion Request — {{entityLabel}}',
      eyebrow: '',
      headline: 'Deletion request',
      lead: 'Your deletion request for {{entityTypeLabelLower}} "{{entityLabel}}" has been reviewed.',
      noteTitle: 'Reviewer note',
      noteBody: '{{reviewReason}}',
      primaryActionLabel: 'View deletion requests',
      htmlSource: '',
    },
    variables: [
      v('requestorName', 'Requestor Name'),
      v('statusLabel', 'Status'),
      v('statusLabelTitle', 'Status Title'),
      v('entityTypeLabel', 'Record Type'),
      v('entityTypeLabelLower', 'Record Type Lowercase'),
      v('entityLabel', 'Record'),
      v('reason', 'Reason For Deletion'),
      v('reviewReason', 'Reviewer Note'),
      v('reviewedByName', 'Reviewed By'),
    ],
    sampleVars: {
      requestorName: 'Alex Morgan',
      statusLabel: 'approved',
      statusLabelTitle: 'Approved',
      entityTypeLabel: 'Customer',
      entityTypeLabelLower: 'customer',
      entityLabel: 'Northstar Logistics',
      reason: 'Duplicate record created in error.',
      reviewReason: 'Confirmed duplicate.',
      reviewedByName: 'Susan AI Administrator',
    },
  },
  {
    typeKey: 'user_signup_pending',
    name: 'User signup pending approval',
    description: 'Notify managers when a new staff signup needs approval.',
    audience: 'staff',
    group: 'security',
    defaults: {
      subject: 'New User Awaiting Approval — {{userName}}',
      eyebrow: '',
      headline: 'New user awaiting approval',
      lead: 'A staff signup finished email verification and needs an administrator to approve the account.',
      noteTitle: '',
      noteBody: '',
      primaryActionLabel: 'Review users',
      htmlSource: '',
    },
    variables: [
      v('adminName', 'Admin Name'),
      v('userName', 'Name'),
      v('userEmail', 'User Email'),
    ],
    sampleVars: {
      adminName: 'Jordan Lee',
      userName: 'Casey Quinn',
      userEmail: 'casey@example.com',
    },
  },
  {
    typeKey: 'invoice_pending_approval',
    name: 'Invoice pending approval',
    description: 'Notify approvers when an invoice needs manager approval.',
    audience: 'staff',
    group: 'workflow',
    defaults: {
      subject: 'Invoice Pending Approval — {{invoiceNumber}}',
      eyebrow: '',
      headline: 'Invoice needs approval',
      lead: 'Invoice {{invoiceNumber}} for {{customerName}} is waiting for manager approval.',
      noteTitle: '',
      noteBody: '',
      primaryActionLabel: 'Review invoice',
      htmlSource: '',
    },
    variables: [
      v('approverName', 'Approver Name'),
      v('invoiceNumber', 'Invoice Number'),
      v('customerName', 'Customer Name'),
      v('total', 'Total'),
    ],
    sampleVars: {
      approverName: 'Jordan Lee',
      invoiceNumber: 'INV-1042',
      customerName: 'Northstar Logistics',
      total: '$1,250.00',
    },
  },
  {
    typeKey: 'customer_service_request_staff',
    name: 'Customer service request (staff)',
    description: 'Notify staff when a customer submits a portal service request.',
    audience: 'staff',
    group: 'workflow',
    defaults: {
      subject: 'Customer Service Request — {{customerName}}',
      eyebrow: '',
      headline: 'New customer service request',
      lead: '{{customerName}} submitted a service request. Check the portal for full details and next steps.',
      noteTitle: 'Customer message',
      noteBody: '{{message}}',
      primaryActionLabel: 'View in portal',
      htmlSource: '',
    },
    variables: [
      v('recipientName', 'Recipient'),
      v('customerName', 'Customer Name'),
      v('vehicleUnit', 'Vehicle'),
      v('serviceCategory', 'Category'),
      v('urgency', 'Urgency'),
      v('message', 'Message'),
    ],
    sampleVars: {
      recipientName: 'Alex Morgan',
      customerName: 'Northstar Logistics',
      vehicleUnit: 'Unit 12',
      serviceCategory: 'Brakes',
      urgency: 'Normal',
      message: 'Please inspect the front brakes before Friday.',
    },
  },
  {
    typeKey: 'customer_change_request_staff',
    name: 'Customer change request (staff)',
    description: 'Notify staff when a customer submits a billing or vehicle change request.',
    audience: 'staff',
    group: 'workflow',
    defaults: {
      subject: 'Customer Change Request — {{customerName}}',
      eyebrow: '',
      headline: 'New customer change request',
      lead: '{{customerName}} submitted a {{requestKindLabelLower}}. Review the request in the portal.',
      noteTitle: 'Customer message',
      noteBody: '{{message}}',
      primaryActionLabel: 'Review in portal',
      htmlSource: '',
    },
    variables: [
      v('recipientName', 'Recipient'),
      v('customerName', 'Customer Name'),
      v('requestKindLabel', 'Request Type'),
      v('requestKindLabelLower', 'Request Type Lowercase'),
      v('topic', 'Topic'),
      v('message', 'Message'),
    ],
    sampleVars: {
      recipientName: 'Alex Morgan',
      customerName: 'Northstar Logistics',
      requestKindLabel: 'Billing correction request',
      requestKindLabelLower: 'billing correction request',
      topic: 'Incorrect line item',
      message: 'Line 3 should be labor, not parts.',
    },
  },
  {
    typeKey: 'customer_email_received_staff',
    name: 'Customer email received (staff)',
    description: 'Notify staff when a new customer email arrives in the inbox.',
    audience: 'staff',
    group: 'workflow',
    defaults: {
      subject: '{{customerName}} Sent A Message',
      eyebrow: '',
      headline: '{{customerName}} Sent A Message',
      lead: '{{customerName}} emailed your company inbox. Sign in to DORINC, open Messages, and reply to the customer.',
      noteTitle: '',
      noteBody: '',
      primaryActionLabel: 'Sign in & reply',
      htmlSource: '',
    },
    variables: [
      v('recipientName', 'Recipient'),
      v('customerName', 'Customer Name'),
      v('customerEmail', 'Customer Email'),
      v('subject', 'Subject'),
    ],
    sampleVars: {
      recipientName: 'Alex Morgan',
      customerName: 'Northstar Logistics',
      customerEmail: 'fleet@northstar.example.com',
      subject: 'Question about my invoice',
    },
  },
  {
    typeKey: 'chat_message_received',
    name: 'Chat message received',
    description: 'Email notification for a new team chat or DM.',
    audience: 'staff',
    group: 'workflow',
    defaults: {
      subject: '{{senderName}} sent a message',
      eyebrow: '',
      headline: '{{senderName}} sent a message',
      lead: 'You received a new message in the {{channelLabel}} channel.',
      noteTitle: '',
      noteBody: '',
      primaryActionLabel: 'Open message',
      htmlSource: '',
    },
    variables: [
      v('recipientName', 'Name'),
      v('senderName', 'Sender'),
      v('channelLabel', 'Channel'),
      v('messagePreview', 'Message'),
    ],
    sampleVars: {
      recipientName: 'Alex Morgan',
      senderName: 'Jordan Lee',
      channelLabel: 'Team',
      messagePreview: 'Can you review INV-1042 before lunch?',
    },
  },
  {
    typeKey: 'service_log_sent_to_invoice_staff',
    name: 'Service log sent to invoice',
    description: 'Notify staff when a service log creates a draft invoice.',
    audience: 'staff',
    group: 'workflow',
    defaults: {
      subject: 'Invoice needs to be completed — {{serviceLogLabel}}',
      eyebrow: '',
      headline: 'Invoice needs to be completed',
      lead: '{{senderName}} sent {{serviceLogLabel}} to invoice. Open the draft and finish billing when you are ready.',
      noteTitle: '',
      noteBody: '',
      primaryActionLabel: 'Complete invoice',
      htmlSource: '',
    },
    variables: [
      v('recipientName', 'Name'),
      v('senderName', 'Sender'),
      v('serviceLogLabel', 'Service Log'),
      v('customerName', 'Customer Name'),
      v('vehicleUnit', 'Vehicle'),
      v('invoiceNumber', 'Invoice Number'),
    ],
    sampleVars: {
      recipientName: 'Alex Morgan',
      senderName: 'Casey Quinn',
      serviceLogLabel: 'SL-8821',
      customerName: 'Northstar Logistics',
      vehicleUnit: 'Unit 12',
      invoiceNumber: 'INV-1042',
    },
  },
]

export const EMAIL_TEMPLATE_TYPE_KEYS = EMAIL_TEMPLATE_CATALOG.map(t => t.typeKey)

export function getEmailTemplateDefinition(typeKey: string): EmailTemplateDefinition | null {
  return EMAIL_TEMPLATE_CATALOG.find(t => t.typeKey === typeKey) ?? null
}

export function isEmailTemplateTypeKey(value: string): boolean {
  return EMAIL_TEMPLATE_TYPE_KEYS.includes(value)
}
