import { z } from 'zod'
import { FILE_DOCUMENT_ACTIVE_CATEGORIES } from '../document-categories'

export const documentChangeRequestActionSchema = z.enum(['replace', 'remove'])

export const portalDocumentChangeRequestSchema = z.object({
  action: documentChangeRequestActionSchema,
  notes: z.string().trim().max(2000).optional(),
})

export type PortalDocumentChangeRequestInput = z.infer<typeof portalDocumentChangeRequestSchema>

export const portalDocumentChangeVehicleParamsSchema = z.object({
  id: z.string().uuid(),
})

export const documentChangeReviewKindSchema = z.literal('document')

export type DocumentChangeReviewPayload = {
  documentCategory: typeof FILE_DOCUMENT_ACTIVE_CATEGORIES[number]
  action: 'replace' | 'remove'
  pendingFileId: string | null
  customerNotes: string | null
}
