import { z } from 'zod'
import { uuidSchema } from './common'

export const fileOwnerEntityTypeSchema = z.enum(['service_log', 'invoice', 'estimate', 'customer', 'vehicle', 'request', 'template', 'company'])
export const fileKindSchema = z.enum(['original', 'preview', 'thumbnail', 'pdf', 'attachment'])

/** Multipart text fields accompanying an upload. */
export const fileUploadFieldsSchema = z.object({
  ownerEntityType: fileOwnerEntityTypeSchema,
  ownerEntityId: uuidSchema,
  fileKind: fileKindSchema.optional(),
})

export const fileListQuerySchema = z.object({
  ownerEntityType: fileOwnerEntityTypeSchema,
  ownerEntityId: uuidSchema,
  fileKind: fileKindSchema.optional(),
  includeArchived: z.coerce.boolean().optional(),
})
