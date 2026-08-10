import { z } from 'zod'
import { emailSchema, nonEmptyString } from './common'
import { messageNotifyChannelSchema, phoneE164Schema } from './quo'

/** Empty string / null clears the saved phone. */
const accountPhoneSchema = z.preprocess((value) => {
  if (value === '' || value === null || value === undefined) return null
  return value
}, phoneE164Schema.nullable())

export const accountProfileSchema = z.object({
  firstName: nonEmptyString.max(60),
  lastName: nonEmptyString.max(60),
  email: emailSchema,
  phone: accountPhoneSchema.optional(),
})

export const accountPasswordSchema = z.object({
  currentPassword: z.string().min(1).max(200),
  newPassword: z.string().min(12).max(200),
})

export const accountNotificationPrefsSchema = z.object({
  teamChatEnabled: z.boolean().optional(),
  messageEmailNotify: z.boolean().optional(),
  messageNotifyChannel: messageNotifyChannelSchema.optional(),
  silentDeveloperMode: z.boolean().optional(),
}).refine(
  data => data.teamChatEnabled !== undefined
    || data.messageEmailNotify !== undefined
    || data.messageNotifyChannel !== undefined
    || data.silentDeveloperMode !== undefined,
  { message: 'At least one notification preference is required' },
)

export type AccountProfileInput = z.infer<typeof accountProfileSchema>
export type AccountPasswordInput = z.infer<typeof accountPasswordSchema>
export type AccountNotificationPrefsInput = z.infer<typeof accountNotificationPrefsSchema>
