import { z } from 'zod'
import { uuidSchema } from './common'

export const editableEntityTypeSchema = z.enum(['invoice', 'estimate'])

export const editingSessionAcquireSchema = z.object({
  entityType: editableEntityTypeSchema,
  entityId: uuidSchema,
})

export const editingSessionQuerySchema = z.object({
  entityType: editableEntityTypeSchema,
  entityId: uuidSchema,
})

export const editingSessionAdminReleaseSchema = z.object({
  reason: z.string().trim().min(3, 'Reason is required').max(500),
})
