import { z } from 'zod'
import { paginationSchema, uuidSchema } from './common'

export const deletionEntityTypeSchema = z.enum(['customer', 'vehicle', 'service_log', 'invoice', 'conversation'])

export const DELETION_REASON_MIN_CHARS = 20
export const DELETION_REASON_MAX_CHARS = 2000

export const deletionRequestCreateSchema = z.object({
  entityType: deletionEntityTypeSchema,
  entityId: uuidSchema,
  reason: z.string().trim()
    .min(DELETION_REASON_MIN_CHARS, `Explain why this record should be removed (min ${DELETION_REASON_MIN_CHARS} characters)`)
    .max(DELETION_REASON_MAX_CHARS),
})

export const directDeleteSchema = z.object({
  entityType: deletionEntityTypeSchema,
  entityId: uuidSchema,
  reason: z.string().trim().max(2000).optional(),
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
  requestId: uuidSchema.optional(),
  status: z.enum(['pending', 'approved', 'rejected', 'decided', 'all']).optional().default('pending'),
  q: z.string().trim().max(200).optional(),
})
