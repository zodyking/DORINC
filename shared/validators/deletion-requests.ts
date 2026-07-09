import { z } from 'zod'
import { paginationSchema, uuidSchema } from './common'

export const deletionEntityTypeSchema = z.enum(['customer', 'vehicle', 'service_log', 'invoice'])

export const deletionRequestCreateSchema = z.object({
  entityType: deletionEntityTypeSchema,
  entityId: uuidSchema,
  reason: z.string().trim().min(10, 'Explain why this record should be removed (min 10 characters)').max(2000),
})

export const deletionRequestReviewSchema = z.object({
  reason: z.string().trim().max(2000).optional(),
})

export const deletionRequestRejectSchema = z.object({
  reason: z.string().trim().min(3, 'A rejection reason is required').max(2000),
})

export const deletionRequestListQuerySchema = paginationSchema.extend({
  entityType: deletionEntityTypeSchema.optional(),
  entityId: uuidSchema.optional(),
  status: z.enum(['pending', 'approved', 'rejected', 'all']).optional().default('pending'),
  q: z.string().trim().max(200).optional(),
})
