import { z } from 'zod'

export const uuidSchema = z.uuid()
export const emailSchema = z.email().max(320)

/** Money values travel as strings and map to numeric(12,2) — never float. */
export const moneySchema = z
  .string()
  .regex(/^-?\d{1,10}(\.\d{1,2})?$/, 'Must be a money amount with up to 2 decimals')

export const paginationSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(25),
})

export const idParamSchema = z.object({ id: uuidSchema })

export const nonEmptyString = z.string().trim().min(1)

export type Pagination = z.infer<typeof paginationSchema>
