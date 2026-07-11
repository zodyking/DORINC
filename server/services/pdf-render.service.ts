import { eq } from 'drizzle-orm'
import type { Db } from '../db/client'
import type { PdfRenderEntityType } from '../db/schema/pdf-render-jobs'
import { pdfRenderJobs } from '../db/schema/pdf-render-jobs'

export interface EnqueuePdfRenderJobInput {
  entityType: PdfRenderEntityType
  entityId: string
  renderPayload: string
  originalFilename: string
  templateVersionId?: string | null
  createdBy?: string | null
  maxAttempts?: number
}

/** Queue Blade payload → PDF render for the pdf-worker container (SPEC §9). */
export async function enqueuePdfRenderJob(db: Db, input: EnqueuePdfRenderJobInput) {
  const [row] = await db.insert(pdfRenderJobs).values({
    entityType: input.entityType,
    entityId: input.entityId,
    templateVersionId: input.templateVersionId ?? null,
    renderPayload: input.renderPayload,
    originalFilename: input.originalFilename,
    createdBy: input.createdBy ?? null,
    maxAttempts: input.maxAttempts ?? 3,
  }).returning()
  return row!
}

export async function getPdfRenderJob(db: Db, id: string) {
  const [row] = await db.select().from(pdfRenderJobs).where(eq(pdfRenderJobs.id, id))
  return row ?? null
}
