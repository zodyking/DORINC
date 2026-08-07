import { z } from 'zod'
import { uuidSchema } from './common'

export const serviceLogUploadSessionCreateSchema = z.object({
  customerId: uuidSchema,
  vehicleId: uuidSchema,
  technicianId: uuidSchema,
  invoiceId: uuidSchema.nullish(),
  serviceDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use YYYY-MM-DD').optional(),
})

export const serviceLogWizardAttachSchema = z.object({
  customerId: uuidSchema,
  vehicleId: uuidSchema,
  technicianId: uuidSchema,
  invoiceId: uuidSchema.nullish(),
  serviceLogId: uuidSchema.nullish(),
  serviceDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use YYYY-MM-DD').optional(),
  finalize: z.boolean().optional(),
})

export type ServiceLogUploadSessionCreate = z.infer<typeof serviceLogUploadSessionCreateSchema>
