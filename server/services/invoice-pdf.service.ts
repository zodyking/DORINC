import { and, desc, eq, inArray } from 'drizzle-orm'
import type { Db } from '../db/client'
import type { InvoiceStatus } from '../db/schema/invoices'
import { invoiceFiles } from '../db/schema/invoices'
import { pdfRenderJobs } from '../db/schema/pdf-render-jobs'
import {
  buildDocumentPdfRenderPayload,
  buildInvoicePdfData,
  businessProfileToDocumentPdfCompany,
  serializePdfRenderPayload,
} from '../../shared/document-pdf-payload'
import { archiveFile, getFileWithData } from './files.service'
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
export const PDF_ELIGIBLE_STATUSES: InvoiceStatus[] = ['sent', 'paid']

/** Draft invoices that may receive a pre-send PDF when queued for email delivery. */
export const PDF_SEND_ELIGIBLE_STATUSES: InvoiceStatus[] = ['draft', 'pending_manager_approval']

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
    company: businessProfileToDocumentPdfCompany(business),
    design: template.designSettings,
  })
  const options = pdfOptionsFromTemplate(template)
  return buildDocumentPdfRenderPayload(data, options)
}

export async function getDefaultPublishedTemplateVersion(db: Db) {
  const template = await resolveInvoicePdfTemplate(db)
  return {
    version: {
      id: template.templateVersionId,
      bladeView: template.bladeView,
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

export interface GenerateInvoicePdfOptions {
  /**
   * Replace an existing official PDF with a fresh render from the current
   * published Blade template. Used to unify invoices generated under older
   * template eras.
   */
  force?: boolean
  /** Allow PDF enqueue for draft/pending invoices (invoice send pipeline only). */
  allowDraft?: boolean
}

/** Clear the official invoice PDF row so a new Blade render can be stored. */
async function clearOfficialInvoicePdf(db: Db, invoiceId: string) {
  const existing = await getInvoicePdfRecord(db, invoiceId)
  if (!existing) return null

  await db.delete(invoiceFiles).where(eq(invoiceFiles.invoiceId, invoiceId))
  try {
    await archiveFile(db, existing.fileId)
  }
  catch {
    // File may already be archived or missing — official row is gone either way.
  }
  return existing
}

/** Enqueue PDF render for a finalized invoice — immutable once stored unless force=true. */
export async function generateInvoicePdf(
  db: Db,
  invoiceId: string,
  actorId: string,
  options: GenerateInvoicePdfOptions = {},
): Promise<GenerateInvoicePdfResult> {
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

  const statusEligible = PDF_ELIGIBLE_STATUSES.includes(detail.status)
    || (options.allowDraft && PDF_SEND_ELIGIBLE_STATUSES.includes(detail.status))
  if (!statusEligible) {
    throw new InvoicePdfServiceError('NOT_FINALIZED')
  }

  const template = await resolveInvoicePdfTemplate(db)
  const existing = await getInvoicePdfRecord(db, invoiceId)

  if (existing && !options.force) {
    // Auto-refresh when the stored PDF was built on a different template version
    // (e.g. pre-Blade / old published design) so official downloads stay unified.
    const sameTemplate = existing.templateVersionId != null
      && template.templateVersionId != null
      && existing.templateVersionId === template.templateVersionId
    if (sameTemplate || template.templateVersionId == null) {
      return {
        job: null,
        invoiceFile: existing,
        alreadyExists: true,
        templateVersionId: existing.templateVersionId,
      }
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

  if (existing && (options.force || existing.templateVersionId !== template.templateVersionId)) {
    await clearOfficialInvoicePdf(db, invoiceId)
  }

  const payload = await buildInvoicePdfPayload(db, detail, template)
  const filename = `${detail.invoiceNumberFormatted}.pdf`

  const job = await enqueuePdfRenderJob(db, {
    entityType: 'invoice',
    entityId: invoiceId,
    renderPayload: serializePdfRenderPayload(payload),
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
