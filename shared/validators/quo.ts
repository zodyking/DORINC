import { z } from 'zod'
import { normalizePhoneE164 } from '../format/phone-e164'

function emptyToUndefined(value: unknown): unknown {
  if (value === '' || value === null) return undefined
  return value
}

const optionalApiKey = z.preprocess(
  emptyToUndefined,
  z.string().trim().min(8).max(512).optional(),
)

export const MESSAGE_NOTIFY_CHANNELS = ['email', 'sms'] as const
export type MessageNotifyChannel = (typeof MESSAGE_NOTIFY_CHANNELS)[number]

export const messageNotifyChannelSchema = z.enum(MESSAGE_NOTIFY_CHANNELS)

export const phoneE164Schema = z.string().trim().min(7).max(32).transform((raw, ctx) => {
  const normalized = normalizePhoneE164(raw)
  if (!normalized) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Enter a valid phone number' })
    return z.NEVER
  }
  return normalized
})

export const optionalPhoneE164Schema = z.preprocess(
  emptyToUndefined,
  phoneE164Schema.optional().nullable(),
)

export const quoSettingsPatchSchema = z.object({
  enabled: z.boolean().optional(),
  apiKey: optionalApiKey,
  fromNumber: z.preprocess(
    emptyToUndefined,
    z.string().trim().min(1).max(32).optional(),
  ),
})

export type QuoSettingsPatch = z.infer<typeof quoSettingsPatchSchema>

export const quoTestSmsSchema = z.object({
  to: phoneE164Schema.optional(),
})

export type QuoTestSmsInput = z.infer<typeof quoTestSmsSchema>

export interface QuoSettingsView {
  enabled: boolean
  hasApiKey: boolean
  fromNumber: string | null
  configured: boolean
  /** True when an inbound message.received webhook is registered for Susan SMS. */
  webhookConfigured: boolean
  webhookUrl: string | null
}

export interface QuoPublicStatus {
  enabled: boolean
}
