import { z } from 'zod'
import { emailSchema, nonEmptyString } from './common'

export const staffLoginGeoSchema = z.object({
  latitude: z.number().min(-90).max(90),
  longitude: z.number().min(-180).max(180),
  accuracyM: z.number().min(0).max(100_000).optional(),
})

export type StaffLoginGeo = z.infer<typeof staffLoginGeoSchema>

export const staffLoginBodySchema = z.object({
  portal: z.literal('staff'),
  email: emailSchema,
  password: z.string().min(1).max(200),
  geo: staffLoginGeoSchema.optional(),
})

export const completeStaffLoginBodySchema = z.object({
  loginToken: z.string().min(1).max(500),
  geo: staffLoginGeoSchema,
})

export const customerLoginBodySchema = z.object({
  portal: z.literal('customer'),
  username: nonEmptyString.max(32),
  password: z.string().min(1).max(200),
})

export const loginBodySchema = z.discriminatedUnion('portal', [
  customerLoginBodySchema,
  staffLoginBodySchema,
])

export const outsideGeoVerifyBodySchema = z.object({
  code: z.string().trim().regex(/^\d{6}$/, 'Enter the 6-digit verification code'),
})

/** Browser GPS check for the access gate. Coords optional → IP fallback. */
export const outsideGeoDeviceCheckBodySchema = z.object({
  latitude: z.number().min(-90).max(90).optional(),
  longitude: z.number().min(-180).max(180).optional(),
  accuracyM: z.number().min(0).max(100_000).optional(),
}).refine(
  data => (data.latitude == null) === (data.longitude == null),
  { message: 'latitude and longitude must be provided together' },
)
