import { z } from 'zod'
import { emailSchema } from './common'

export const smtpTestSchema = z.object({
  to: emailSchema.optional(),
})

export const smtpSettingsSchema = z.object({
  host: z.string().min(1).max(255),
  port: z.coerce.number().int().min(1).max(65535).default(587),
  username: z.string().max(255).default(''),
  password: z.string().max(500).optional(),
  fromName: z.string().max(120).default(''),
  fromAddress: z.string().min(1).max(255),
})

export type SmtpSettingsInput = z.infer<typeof smtpSettingsSchema>
