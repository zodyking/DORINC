import { z } from 'zod'
import { moneySchema, nonEmptyString, uuidSchema } from './common'

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

export const portalLineItemCorrectionInputSchema = z.object({
  lineItemId: uuidSchema,
  description: z.string().trim().min(1).max(500),
  quantity: moneySchema,
  unitPrice: moneySchema,
  notes: z.string().trim().max(2000).optional().nullable(),
})

export const portalInvoiceChangeRequestSchema = z.object({
  invoiceId: z.string().uuid().optional().nullable(),
  topic: nonEmptyString.max(120),
  description: z.string().trim().max(4000).optional().nullable(),
  lineItemCorrection: portalLineItemCorrectionInputSchema.optional(),
}).superRefine((val, ctx) => {
  if (!val.lineItemCorrection && !val.description?.trim()) {
    ctx.addIssue({
      code: 'custom',
      message: 'Description or line item correction is required',
      path: ['description'],
    })
  }
  if (val.lineItemCorrection && !val.invoiceId) {
    ctx.addIssue({
      code: 'custom',
      message: 'Invoice is required for line item corrections',
      path: ['invoiceId'],
    })
  }
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
export type PortalLineItemCorrectionInput = z.infer<typeof portalLineItemCorrectionInputSchema>
export type PortalInvoiceChangeRequestInput = z.infer<typeof portalInvoiceChangeRequestSchema>
export type PortalVehicleChangeRequestInput = z.infer<typeof portalVehicleChangeRequestSchema>
export type PortalGeneralRequestInput = z.infer<typeof portalGeneralRequestSchema>
