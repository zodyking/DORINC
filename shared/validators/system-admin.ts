import { z } from 'zod'
import { emailSchema } from './common'

export const smtpTestSchema = z.object({
  to: emailSchema.optional(),
})

export type SmtpTestInput = z.infer<typeof smtpTestSchema>
