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

const optionalPortalCredential = z.preprocess(
  emptyToUndefined,
  z.string().trim().min(1).max(512).optional(),
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

/** Empty / null clears the stored payment date. */
const optionalPaymentDate = z.preprocess(
  (value) => {
    if (value === undefined) return undefined
    if (value === '' || value === null) return null
    return value
  },
  z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use YYYY-MM-DD').nullable().optional(),
)

/** Empty / null clears the stored payment amount. */
const optionalPaymentAmountUsd = z.preprocess(
  (value) => {
    if (value === undefined) return undefined
    if (value === '' || value === null) return null
    return value
  },
  z.coerce.number().min(0).max(999999).nullable().optional(),
)

export const quoSettingsPatchSchema = z.object({
  enabled: z.boolean().optional(),
  apiKey: optionalApiKey,
  fromNumber: z.preprocess(
    emptyToUndefined,
    z.string().trim().min(1).max(32).optional(),
  ),
  /** Next Quo prepaid payment / renewal date (UTC calendar day). */
  paymentDate: optionalPaymentDate,
  /** Expected Quo prepaid cost in USD for that payment. */
  paymentAmountUsd: optionalPaymentAmountUsd,
  /** Quo app portal username / email (optional; revealable on Billing). */
  portalUsername: optionalPortalCredential,
  /** Quo app portal password (optional; revealable on Billing). */
  portalPassword: optionalPortalCredential,
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
  /** Next prepaid payment date (YYYY-MM-DD), when set in Control Panel. */
  paymentDate: string | null
  /** Expected prepaid payment amount in USD. */
  paymentAmountUsd: number | null
  hasPortalUsername: boolean
  hasPortalPassword: boolean
}

export interface QuoPublicStatus {
  enabled: boolean
}
