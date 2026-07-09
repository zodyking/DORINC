import { z } from 'zod'
import { emailSchema, nonEmptyString } from './common'

export const accountProfileSchema = z.object({
  firstName: nonEmptyString.max(60),
  lastName: nonEmptyString.max(60),
  email: emailSchema,
})

export const accountPasswordSchema = z.object({
  currentPassword: z.string().min(1).max(200),
  newPassword: z.string().min(12).max(200),
})

export type AccountProfileInput = z.infer<typeof accountProfileSchema>
export type AccountPasswordInput = z.infer<typeof accountPasswordSchema>
