import { and, desc, eq, inArray } from 'drizzle-orm'
import type { Db } from '../db/client'
import type { EstimateStatus } from '../db/schema/estimates'
import { estimateFiles } from '../db/schema/estimates'
import { pdfRenderJobs } from '../db/schema/pdf-render-jobs'
import {
  buildDocumentPdfRenderPayload,
  buildEstimatePdfData,
  serializePdfRenderPayload,
} from '../../shared/document-pdf-payload'
import { enqueuePdfRenderJob } from './pdf-render.service'
import { getFileWithData } from './files.service'
import { getEstimateDetail, EstimatesServiceError } from './estimates.service'
import {
  pdfRenderOptionsFromTemplate,
  resolveInvoicePdfTemplate,
} from './invoice-template-source.service'
import { getBusinessProfile } from './workspace-settings.service'

export type EstimatePdfServiceErrorCode
  = 'NOT_FOUND'
    | 'NOT_FINALIZED'
    | 'NO_PDF'

export class EstimatePdfServiceError extends Error {
  constructor(public readonly code: EstimatePdfServiceErrorCode) {
    super(code)
  }
}

/** Sent/approved estimates eligible for official PDF generation (SPEC §9). */
export const ESTIMATE_PDF_ELIGIBLE_STATUSES: EstimateStatus[] = ['sent', 'approved']

function logoPreviewPath(fileId: string | null | undefined): string | null {
  if (!fileId) return null
  const base = process.env.APP_URL?.trim().replace(/\/$/, '')
  const path = `/api/files/${fileId}/preview`
  return base ? `${base}${path}` : path
}

export async function getEstimatePdfRecord(db: Db, estimateId: string) {
  const [row] = await db.select().from(estimateFiles).where(eq(estimateFiles.estimateId, estimateId))
  return row ?? null
}

export async function getPendingEstimatePdfRenderJob(db: Db, estimateId: string) {
  const [row] = await db.select().from(pdfRenderJobs)
    .where(and(
      eq(pdfRenderJobs.entityType, 'estimate'),
      eq(pdfRenderJobs.entityId, estimateId),
      inArray(pdfRenderJobs.status, ['queued', 'processing']),
    ))
    .orderBy(desc(pdfRenderJobs.createdAt))
    .limit(1)
  return row ?? null
}

export interface GenerateEstimatePdfResult {
  job: typeof pdfRenderJobs.$inferSelect | null
  estimateFile: typeof estimateFiles.$inferSelect | null
  alreadyExists: boolean
  templateVersionId: string | null
}

/** Enqueue PDF render for a sent/approved estimate — immutable once stored (SPEC §9). */
export async function generateEstimatePdf(db: Db, estimateId: string, actorId: string): Promise<GenerateEstimatePdfResult> {
  let detail
  try {
    detail = await getEstimateDetail(db, estimateId)
  }
  catch (err) {
    if (err instanceof EstimatesServiceError && err.code === 'NOT_FOUND') {
      throw new EstimatePdfServiceError('NOT_FOUND')
    }
    throw err
  }

  if (!ESTIMATE_PDF_ELIGIBLE_STATUSES.includes(detail.status)) {
    throw new EstimatePdfServiceError('NOT_FINALIZED')
  }

  const existing = await getEstimatePdfRecord(db, estimateId)
  if (existing) {
    return {
      job: null,
      estimateFile: existing,
      alreadyExists: true,
      templateVersionId: existing.templateVersionId,
    }
  }

  const pending = await getPendingEstimatePdfRenderJob(db, estimateId)
  if (pending) {
    return {
      job: pending,
      estimateFile: null,
      alreadyExists: false,
      templateVersionId: pending.templateVersionId,
    }
  }

  const template = await resolveInvoicePdfTemplate(db)
  const business = await getBusinessProfile(db)
  const data = buildEstimatePdfData({
    ...detail,
    invoiceNumberFormatted: detail.estimateNumberFormatted,
    invoiceDate: detail.estimateDate,
    status: detail.status,
    paymentTerms: 'due_on_receipt',
    amountPaid: '0',
    balanceDue: detail.total,
    validUntil: detail.validUntil,
  }, {
    company: { name: business.businessName || undefined },
    design: template.designSettings,
    logoUrl: logoPreviewPath(template.designSettings.logoFileId),
  })
  const payload = buildDocumentPdfRenderPayload(data, pdfRenderOptionsFromTemplate(template))
  const filename = `${detail.estimateNumberFormatted}.pdf`

  const job = await enqueuePdfRenderJob(db, {
    entityType: 'estimate',
    entityId: estimateId,
    renderPayload: serializePdfRenderPayload(payload),
    originalFilename: filename,
    templateVersionId: template.templateVersionId,
    createdBy: actorId,
  })

  return {
    job,
    estimateFile: null,
    alreadyExists: false,
    templateVersionId: template.templateVersionId,
  }
}

export async function getEstimatePdfDownload(db: Db, estimateId: string) {
  const record = await getEstimatePdfRecord(db, estimateId)
  if (!record) throw new EstimatePdfServiceError('NO_PDF')

  const file = await getFileWithData(db, record.fileId)
  if (file.sha256Hash !== record.sha256Hash) {
    throw new Error('Estimate PDF hash mismatch — file integrity check failed')
  }

  return { record, file }
}
