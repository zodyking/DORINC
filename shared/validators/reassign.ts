import { z } from 'zod'
import { uuidSchema } from './common'

export const reassignCustomerSchema = z.object({
  customerId: uuidSchema,
  reason: z.string().trim().max(500).optional(),
})

export const reassignInvoiceCustomerSchema = reassignCustomerSchema.extend({
  vehicleId: uuidSchema.nullish(),
})

export const reassignServiceLogSchema = z.object({
  customerId: uuidSchema,
  vehicleId: uuidSchema,
  reason: z.string().trim().max(500).optional(),
})

export const reassignVehicleSchema = reassignCustomerSchema.extend({
  cascade: z.object({
    updateDraftInvoices: z.boolean().default(true),
    updateOpenServiceLogs: z.boolean().default(true),
  }).optional(),
})

export type ReassignCustomerInput = z.infer<typeof reassignCustomerSchema>
export type ReassignInvoiceCustomerInput = z.infer<typeof reassignInvoiceCustomerSchema>
export type ReassignServiceLogInput = z.infer<typeof reassignServiceLogSchema>
export type ReassignVehicleInput = z.infer<typeof reassignVehicleSchema>
