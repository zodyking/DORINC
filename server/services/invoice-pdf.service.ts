import { and, desc, eq, inArray } from 'drizzle-orm'
import type { Db } from '../db/client'
import type { InvoiceStatus } from '../db/schema/invoices'
import { invoiceFiles } from '../db/schema/invoices'
import { pdfRenderJobs } from '../db/schema/pdf-render-jobs'
import {
  buildDocumentPdfRenderPayload,
  buildInvoicePdfData,
  serializePdfRenderPayload,
} from '../../shared/document-pdf-payload'
import { getFileWithData } from './files.service'
import { renderDocumentPdfBuffer } from './laravel-pdf.service'
import { enqueuePdfRenderJob } from './pdf-render.service'
import { getInvoiceDetail, InvoicesServiceError } from './invoices.service'
import {
  type InvoicePdfTemplateSource,
  pdfRenderOptionsFromTemplate,
  resolveInvoicePdfTemplate,
} from './invoice-template-source.service'
import { getBusinessProfile } from './workspace-settings.service'

export type InvoicePdfServiceErrorCode
  = 'NOT_FOUND'
    | 'NOT_FINALIZED'
    | 'NO_PDF'

export class InvoicePdfServiceError extends Error {
  constructor(public readonly code: InvoicePdfServiceErrorCode) {
    super(code)
  }
}

/** Finalized invoices eligible for official PDF generation (SPEC §9). */
export const PDF_ELIGIBLE_STATUSES: InvoiceStatus[] = ['approved', 'sent', 'paid']

function logoPreviewPath(fileId: string | null | undefined): string | null {
  if (!fileId) return null
  const base = process.env.APP_URL?.trim().replace(/\/$/, '')
  const path = `/api/files/${fileId}/preview`
  return base ? `${base}${path}` : path
}

function pdfOptionsFromTemplate(template: InvoicePdfTemplateSource) {
  return pdfRenderOptionsFromTemplate(template)
}

async function buildInvoicePdfPayload(
  db: Db,
  detail: Awaited<ReturnType<typeof getInvoiceDetail>>,
  template: InvoicePdfTemplateSource,
) {
  const business = await getBusinessProfile(db)
  const data = buildInvoicePdfData(detail, {
    company: { name: business.businessName || undefined },
    design: template.designSettings,
    logoUrl: logoPreviewPath(template.designSettings.logoFileId),
  })
  const options = pdfOptionsFromTemplate(template)
  return buildDocumentPdfRenderPayload(data, options)
}

export async function getDefaultPublishedTemplateVersion(db: Db) {
  const template = await resolveInvoicePdfTemplate(db)
  return {
    version: {
      id: template.templateVersionId,
      htmlContent: template.htmlContent,
      designSettings: template.designSettings,
    },
    isBuiltIn: template.isBuiltIn,
  }
}

export async function getInvoicePdfRecord(db: Db, invoiceId: string) {
  const [row] = await db.select().from(invoiceFiles).where(eq(invoiceFiles.invoiceId, invoiceId))
  return row ?? null
}

export async function getPendingPdfRenderJob(db: Db, invoiceId: string) {
  const [row] = await db.select().from(pdfRenderJobs)
    .where(and(
      eq(pdfRenderJobs.entityType, 'invoice'),
      eq(pdfRenderJobs.entityId, invoiceId),
      inArray(pdfRenderJobs.status, ['queued', 'processing']),
    ))
    .orderBy(desc(pdfRenderJobs.createdAt))
    .limit(1)
  return row ?? null
}

export interface GenerateInvoicePdfResult {
  job: typeof pdfRenderJobs.$inferSelect | null
  invoiceFile: typeof invoiceFiles.$inferSelect | null
  alreadyExists: boolean
  templateVersionId: string | null
}

/** Enqueue PDF render for a finalized invoice — immutable once stored (SPEC §9). */
export async function generateInvoicePdf(db: Db, invoiceId: string, actorId: string): Promise<GenerateInvoicePdfResult> {
  let detail
  try {
    detail = await getInvoiceDetail(db, invoiceId)
  }
  catch (err) {
    if (err instanceof InvoicesServiceError && err.code === 'NOT_FOUND') {
      throw new InvoicePdfServiceError('NOT_FOUND')
    }
    throw err
  }

  if (!PDF_ELIGIBLE_STATUSES.includes(detail.status)) {
    throw new InvoicePdfServiceError('NOT_FINALIZED')
  }

  const existing = await getInvoicePdfRecord(db, invoiceId)
  if (existing) {
    return {
      job: null,
      invoiceFile: existing,
      alreadyExists: true,
      templateVersionId: existing.templateVersionId,
    }
  }

  const pending = await getPendingPdfRenderJob(db, invoiceId)
  if (pending) {
    return {
      job: pending,
      invoiceFile: null,
      alreadyExists: false,
      templateVersionId: pending.templateVersionId,
    }
  }

  const template = await resolveInvoicePdfTemplate(db)
  const payload = await buildInvoicePdfPayload(db, detail, template)
  const filename = `${detail.invoiceNumberFormatted}.pdf`

  const job = await enqueuePdfRenderJob(db, {
    entityType: 'invoice',
    entityId: invoiceId,
    htmlContent: serializePdfRenderPayload(payload),
    originalFilename: filename,
    templateVersionId: template.templateVersionId,
    createdBy: actorId,
  })

  return {
    job,
    invoiceFile: null,
    alreadyExists: false,
    templateVersionId: template.templateVersionId,
  }
}

export async function getInvoicePdfDownload(db: Db, invoiceId: string) {
  const record = await getInvoicePdfRecord(db, invoiceId)
  if (!record) throw new InvoicePdfServiceError('NO_PDF')

  const file = await getFileWithData(db, record.fileId)
  if (file.sha256Hash !== record.sha256Hash) {
    throw new Error('Invoice PDF hash mismatch — file integrity check failed')
  }

  return { record, file }
}

/** Live Blade PDF render for preview (any status) — does not store an official PDF. */
export async function previewInvoicePdf(db: Db, invoiceId: string) {
  let detail
  try {
    detail = await getInvoiceDetail(db, invoiceId)
  }
  catch (err) {
    if (err instanceof InvoicesServiceError && err.code === 'NOT_FOUND') {
      throw new InvoicePdfServiceError('NOT_FOUND')
    }
    throw err
  }

  const template = await resolveInvoicePdfTemplate(db)
  const payload = await buildInvoicePdfPayload(db, detail, template)
  const pdf = await renderDocumentPdfBuffer(payload)

  return {
    pdf,
    filename: `${detail.invoiceNumberFormatted}.pdf`,
    invoiceNumberFormatted: detail.invoiceNumberFormatted,
    status: detail.status,
    isOfficialEligible: PDF_ELIGIBLE_STATUSES.includes(detail.status),
  }
}

export async function getInvoicePdfStatus(db: Db, invoiceId: string) {
  const record = await getInvoicePdfRecord(db, invoiceId)
  const pending = await getPendingPdfRenderJob(db, invoiceId)
  return {
    hasOfficialPdf: Boolean(record),
    invoiceFileId: record?.id ?? null,
    pendingJobId: pending?.id ?? null,
    pendingJobStatus: pending?.status ?? null,
  }
}
