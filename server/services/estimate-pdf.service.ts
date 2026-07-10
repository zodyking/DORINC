import { and, desc, eq, inArray } from 'drizzle-orm'
import type { Db } from '../db/client'
import type { EstimateStatus } from '../db/schema/estimates'
import { estimateFiles } from '../db/schema/estimates'
import { invoiceTemplateVersions, invoiceTemplates } from '../db/schema/invoice-templates'
import { pdfRenderJobs } from '../db/schema/pdf-render-jobs'
import { enqueuePdfRenderJob } from './pdf-render.service'
import { getFileWithData } from './files.service'
import { getEstimateDetail, EstimatesServiceError } from './estimates.service'
import { buildInvoiceRenderHtml } from './invoice-pdf.service'
import { applyDesignSettingsToHtml } from '../../shared/invoice-template-html'

export type EstimatePdfServiceErrorCode
  = 'NOT_FOUND'
    | 'NOT_FINALIZED'
    | 'NO_PDF'
    | 'TEMPLATE_NOT_FOUND'

export class EstimatePdfServiceError extends Error {
  constructor(public readonly code: EstimatePdfServiceErrorCode) {
    super(code)
  }
}

/** Sent/approved estimates eligible for official PDF generation (SPEC §9). */
export const ESTIMATE_PDF_ELIGIBLE_STATUSES: EstimateStatus[] = ['sent', 'approved']

const STATUS_PDF_LABELS: Record<EstimateStatus, string> = {
  draft: 'DRAFT',
  sent: 'SENT',
  approved: 'APPROVED',
  rejected: 'REJECTED',
  converted: 'CONVERTED',
  expired: 'EXPIRED',
  void: 'VOID',
}

export async function getDefaultPublishedTemplateVersion(db: Db) {
  const [row] = await db.select({
    version: invoiceTemplateVersions,
    template: invoiceTemplates,
  })
    .from(invoiceTemplates)
    .innerJoin(
      invoiceTemplateVersions,
      and(
        eq(invoiceTemplateVersions.templateId, invoiceTemplates.id),
        eq(invoiceTemplateVersions.status, 'published'),
      ),
    )
    .where(eq(invoiceTemplates.isDefault, true))
    .orderBy(desc(invoiceTemplateVersions.versionNumber))
    .limit(1)

  if (!row) throw new EstimatePdfServiceError('TEMPLATE_NOT_FOUND')
  return row
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

/** Build render HTML from published template + frozen estimate snapshots (SPEC §9). */
export function buildEstimateRenderHtml(
  templateHtml: string,
  detail: Awaited<ReturnType<typeof getEstimateDetail>>,
): string {
  let html = buildInvoiceRenderHtml(templateHtml, {
    ...detail,
    invoiceNumber: detail.estimateNumber,
    invoiceNumberFormatted: detail.estimateNumberFormatted,
    invoiceDate: detail.estimateDate,
    dueDate: detail.validUntil,
    status: detail.status as 'draft' | 'approved' | 'sent' | 'paid' | 'void',
    paymentTerms: 'due_on_receipt',
    amountPaid: '0',
    balanceDue: detail.total,
  })

  html = html
    .replace(/Invoice /g, 'Estimate ')
    .replace(/INV-/g, 'EST-')
    .replace(/CREATED • NOT SENT/g, STATUS_PDF_LABELS[detail.status])
    .replace(/Due on receipt/g, detail.validUntil ? `Valid until ${detail.validUntil}` : 'Subject to approval')

  return html
}

export interface GenerateEstimatePdfResult {
  job: typeof pdfRenderJobs.$inferSelect | null
  estimateFile: typeof estimateFiles.$inferSelect | null
  alreadyExists: boolean
  templateVersionId: string
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
      templateVersionId: pending.templateVersionId!,
    }
  }

  const { version } = await getDefaultPublishedTemplateVersion(db)
  const templateHtml = applyDesignSettingsToHtml(
    version.htmlContent,
    version.designSettings,
    version.designSettings.logoFileId ? `/api/files/${version.designSettings.logoFileId}/preview` : null,
  )
  const htmlContent = buildEstimateRenderHtml(templateHtml, detail)
  const filename = `${detail.estimateNumberFormatted}.pdf`

  const job = await enqueuePdfRenderJob(db, {
    entityType: 'estimate',
    entityId: estimateId,
    htmlContent,
    originalFilename: filename,
    templateVersionId: version.id,
    createdBy: actorId,
  })

  return {
    job,
    estimateFile: null,
    alreadyExists: false,
    templateVersionId: version.id,
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
