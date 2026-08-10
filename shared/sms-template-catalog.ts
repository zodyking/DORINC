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
      body: '{{brandName}}: You\'re invited, {{name}}. Sign in at {{loginUrl}} with {{email}}. Temp password was emailed — change it after login.',
    },
    variables: [
      ...brandVars,
      { key: 'name', label: 'User name' },
      { key: 'email', label: 'Email' },
      { key: 'loginUrl', label: 'Login URL' },
    ],
    sampleVars: {
      brandName: 'DORINC',
      name: 'Alex Rivera',
      email: 'alex@example.com',
      loginUrl: 'https://app.example.com/auth/login',
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
