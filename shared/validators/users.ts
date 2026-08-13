import { z } from 'zod'
import { emailSchema, nonEmptyString } from './common'

export const inviteStaffUserSchema = z.object({
  name: nonEmptyString.max(120),
  email: emailSchema,
  accountType: nonEmptyString.max(100),
})

export type InviteStaffUserInput = z.infer<typeof inviteStaffUserSchema>

export const setStaffPasswordSchema = z.object({
  password: z.string().min(12).max(200),
  mustChangePassword: z.boolean().optional().default(true),
})

export type SetStaffPasswordInput = z.infer<typeof setStaffPasswordSchema>
