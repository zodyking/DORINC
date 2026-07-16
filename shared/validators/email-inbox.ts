import { z } from 'zod'
import { emailSchema } from './common'

export const imapSettingsSchema = z.object({
  host: z.string().min(1).max(200),
  port: z.coerce.number().int().min(1).max(65535).default(993),
  username: z.string().min(1).max(200),
  password: z.string().min(1).max(500).optional(),
  mailbox: z.string().min(1).max(200).default('INBOX'),
  useTls: z.boolean().default(true),
})

export const DEFAULT_AUTO_RESPONDER_MESSAGE = 'Thanks for contacting us. We received your email and a team member will reply shortly during business hours.'

export const imapAutoResponderScopeSchema = z.enum(['customers', 'all']).default('customers')

export const imapAutoResponderSchema = z.object({
  enabled: z.boolean().default(false),
  scope: imapAutoResponderScopeSchema,
  subject: z.string().min(1).max(200).default('We received your message'),
  message: z.string().min(1).max(5000).default(DEFAULT_AUTO_RESPONDER_MESSAGE),
})

export const imapFilterSettingsSchema = z.object({
  companyEmail: emailSchema,
  additionalEmails: z.array(emailSchema).default([]),
  includeCustomerEmails: z.boolean().default(true),
  autoResponder: imapAutoResponderSchema.default({
    enabled: false,
    scope: 'customers',
    subject: 'We received your message',
    message: DEFAULT_AUTO_RESPONDER_MESSAGE,
  }),
})

export const imapSettingsPatchSchema = imapSettingsSchema.extend({
  filters: imapFilterSettingsSchema,
})

export const startEmailThreadSchema = z.object({
  customerId: z.string().uuid(),
  toEmail: emailSchema,
  subject: z.string().min(1).max(500),
  body: z.string().min(1).max(50000),
})

export const emailReplySchema = z.object({
  body: z.string().min(1).max(50000),
})

export const conversationChannelSchema = z.enum(['all', 'dm', 'email']).default('all')
