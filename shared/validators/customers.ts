import { z } from 'zod'
import { emailSchema, nonEmptyString } from './common'

export const addressSchema = z.object({
  line1: z.string().max(200).optional(),
  line2: z.string().max(200).optional(),
  city: z.string().max(100).optional(),
  state: z.string().max(50).optional(),
  zip: z.string().max(20).optional(),
})

export const customerCreateSchema = z.object({
  displayName: nonEmptyString.max(200),
  accountKind: z.enum(['fleet', 'individual']).default('individual'),
  email: emailSchema.nullish(),
  phone: z.string().max(40).nullish(),
  billingAddress: addressSchema.nullish(),
  serviceAddress: addressSchema.nullish(),
  taxExempt: z.boolean().optional(),
  paymentTerms: z.enum(['due_on_receipt', 'net_15', 'net_30', 'net_45', 'net_60']).optional(),
  notes: z.string().max(5000).nullish(),
})

export const customerUpdateSchema = customerCreateSchema.partial()

export const contactCreateSchema = z.object({
  name: nonEmptyString.max(120),
  email: emailSchema.nullish(),
  phone: z.string().max(40).nullish(),
  title: z.string().max(80).nullish(),
  isPrimary: z.boolean().optional(),
  isBilling: z.boolean().optional(),
})

export const contactUpdateSchema = contactCreateSchema.partial()
