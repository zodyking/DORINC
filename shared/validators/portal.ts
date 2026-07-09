import { z } from 'zod'
import { nonEmptyString } from './common'

export const portalNewVehicleRequestSchema = z.object({
  fleetTag: nonEmptyString.max(120),
  unitType: z.enum(['truck', 'bus', 'equipment', 'tractor', 'other']).default('truck'),
  vin: z.string().trim().max(17).optional().nullable(),
  year: z.number().int().min(1980).max(2035).optional().nullable(),
  make: z.string().trim().max(80).optional().nullable(),
  model: z.string().trim().max(80).optional().nullable(),
  notes: z.string().trim().max(2000).optional().nullable(),
})

export const portalServiceRequestSchema = z.object({
  vehicleId: z.string().uuid(),
  serviceCategory: nonEmptyString.max(120),
  urgency: z.enum(['normal', 'soon', 'urgent']).default('normal'),
  preferredDate: z.string().trim().max(20).optional().nullable(),
  location: z.string().trim().max(200).optional().nullable(),
  description: nonEmptyString.max(4000),
})

export const portalInvoiceChangeRequestSchema = z.object({
  invoiceId: z.string().uuid().optional().nullable(),
  topic: nonEmptyString.max(120),
  description: nonEmptyString.max(4000),
})

export const portalVehicleChangeRequestSchema = z.object({
  vehicleId: z.string().uuid(),
  subject: nonEmptyString.max(120),
  description: nonEmptyString.max(4000),
})

export const portalGeneralRequestSchema = z.object({
  subject: nonEmptyString.max(120),
  message: nonEmptyString.max(4000),
})

export const portalPasswordSchema = z.object({
  currentPassword: z.string().min(1).max(200),
  newPassword: z.string().min(12).max(200),
})

export type PortalNewVehicleRequestInput = z.infer<typeof portalNewVehicleRequestSchema>
export type PortalServiceRequestInput = z.infer<typeof portalServiceRequestSchema>
export type PortalInvoiceChangeRequestInput = z.infer<typeof portalInvoiceChangeRequestSchema>
export type PortalVehicleChangeRequestInput = z.infer<typeof portalVehicleChangeRequestSchema>
export type PortalGeneralRequestInput = z.infer<typeof portalGeneralRequestSchema>
