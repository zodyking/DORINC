import { z } from 'zod'
import { emailSchema, nonEmptyString } from './common'

export const inviteStaffUserSchema = z.object({
  name: nonEmptyString.max(120),
  email: emailSchema,
  accountType: nonEmptyString.max(100),
})

export type InviteStaffUserInput = z.infer<typeof inviteStaffUserSchema>
