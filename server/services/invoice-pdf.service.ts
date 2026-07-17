import { and, desc, eq, inArray } from 'drizzle-orm'
import { createHash } from 'node:crypto'
import type { Db } from '../db/client'
import { appFiles } from '../db/schema/files'
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
  getBuiltInInvoicePdfTemplate,
  pdfRenderOptionsFromTemplate,
  resolveInvoicePdfTemplate,
} from './invoice-template-source.service'
import { getAppUrl } from './app-config.service'
import { getBusinessProfile } from './workspace-settings.service'

export type InvoicePdfServiceErrorCode
  = 'NOT_FOUND'
    | 'NOT_FINALIZED'
    | 'NO_PDF'
    | 'PDF_FAILED'

export class InvoicePdfServiceError extends Error {
  constructor(public readonly code: InvoicePdfServiceErrorCode, message?: string) {
    super(message ?? code)
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
    portalUrl: `${getAppUrl().replace(/\/$/, '')}/portal`,
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

async function cancelPendingPdfRenderJobs(db: Db, invoiceId: string) {
  await db.update(pdfRenderJobs)
    .set({
      status: 'failed',
      finishedAt: new Date(),
      lastError: 'Superseded by synchronous send render',
    })
    .where(and(
      eq(pdfRenderJobs.entityType, 'invoice'),
      eq(pdfRenderJobs.entityId, invoiceId),
      inArray(pdfRenderJobs.status, ['queued', 'processing']),
    ))
}

/** Render invoice PDF; fall back to the built-in template when a custom blade fails. */
async function renderInvoicePdfWithFallback(
  db: Db,
  detail: Awaited<ReturnType<typeof getInvoiceDetail>>,
  template: InvoicePdfTemplateSource,
): Promise<{ pdf: Buffer, templateVersionId: string | null }> {
  const primaryPayload = await buildInvoicePdfPayload(db, detail, template)

  try {
    const pdf = await renderDocumentPdfBuffer(primaryPayload)
    return { pdf, templateVersionId: template.templateVersionId }
  }
  catch (primaryErr) {
    if (!template.bladeSource) {
      const message = primaryErr instanceof Error ? primaryErr.message : String(primaryErr)
      throw new InvoicePdfServiceError('PDF_FAILED', message)
    }

    const fallbackTemplate = getBuiltInInvoicePdfTemplate()
    const fallbackPayload = await buildInvoicePdfPayload(db, detail, fallbackTemplate)
    try {
      const pdf = await renderDocumentPdfBuffer(fallbackPayload)
      return { pdf, templateVersionId: null }
    }
    catch (fallbackErr) {
      const primaryMessage = primaryErr instanceof Error ? primaryErr.message : String(primaryErr)
      const fallbackMessage = fallbackErr instanceof Error ? fallbackErr.message : String(fallbackErr)
      throw new InvoicePdfServiceError(
        'PDF_FAILED',
        `Custom template failed (${primaryMessage}); built-in fallback also failed (${fallbackMessage})`,
      )
    }
  }
}

async function storeOfficialInvoicePdf(
  db: Db,
  invoiceId: string,
  pdf: Buffer,
  filename: string,
  templateVersionId: string | null,
  actorId: string,
  pdfRenderJobId: string | null = null,
) {
  const sha256Hash = createHash('sha256').update(pdf).digest('hex')
  const [file] = await db.insert(appFiles).values({
    ownerEntityType: 'invoice',
    ownerEntityId: invoiceId,
    fileKind: 'pdf',
    originalFilename: filename,
    mimeType: 'application/pdf',
    fileSizeBytes: pdf.length,
    sha256Hash,
    binaryData: pdf,
    createdBy: actorId,
  }).returning()

  await db.insert(invoiceFiles).values({
    invoiceId,
    fileId: file!.id,
    templateVersionId,
    sha256Hash,
    pdfRenderJobId,
    createdBy: actorId,
  })

  return file!
}

/**
 * Render and store the official invoice PDF immediately for the send pipeline.
 * Avoids queueing pdf_render_jobs so email delivery can start without worker polling.
 */
export async function ensureInvoicePdfForSend(
  db: Db,
  invoiceId: string,
  actorId: string,
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
    || PDF_SEND_ELIGIBLE_STATUSES.includes(detail.status)
  if (!statusEligible) {
    throw new InvoicePdfServiceError('NOT_FINALIZED')
  }

  const template = await resolveInvoicePdfTemplate(db)
  const existing = await getInvoicePdfRecord(db, invoiceId)

  if (existing) {
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
    await clearOfficialInvoicePdf(db, invoiceId)
  }

  await cancelPendingPdfRenderJobs(db, invoiceId)

  const filename = `${detail.invoiceNumberFormatted}.pdf`

  let pdf: Buffer
  let storedTemplateVersionId: string | null
  try {
    const rendered = await renderInvoicePdfWithFallback(db, detail, template)
    pdf = rendered.pdf
    storedTemplateVersionId = rendered.templateVersionId
  }
  catch (err) {
    if (err instanceof InvoicePdfServiceError && err.code === 'PDF_FAILED') throw err
    const message = err instanceof Error ? err.message : String(err)
    throw new InvoicePdfServiceError('PDF_FAILED', message)
  }

  await storeOfficialInvoicePdf(
    db,
    invoiceId,
    pdf,
    filename,
    storedTemplateVersionId,
    actorId,
  )

  const record = await getInvoicePdfRecord(db, invoiceId)
  return {
    job: null,
    invoiceFile: record,
    alreadyExists: false,
    templateVersionId: storedTemplateVersionId,
  }
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
  const { pdf } = await renderInvoicePdfWithFallback(db, detail, template)

  return {
    pdf,
    filename: `${detail.invoiceNumberFormatted}.pdf`,
    invoiceNumberFormatted: detail.invoiceNumberFormatted,
    status: detail.status,
    isOfficialEligible: PDF_ELIGIBLE_STATUSES.includes(detail.status),
  }
}

export type InvoicePdfDisplaySource = 'official' | 'preview'

/** Prefer stored official PDFs; otherwise render a live preview. */
export async function resolveInvoicePdfForDisplay(db: Db, invoiceId: string): Promise<{
  pdf: Buffer
  filename: string
  source: InvoicePdfDisplaySource
}> {
  const record = await getInvoicePdfRecord(db, invoiceId)
  if (record) {
    try {
      const { file } = await getInvoicePdfDownload(db, invoiceId)
      return {
        pdf: file.binaryData,
        filename: file.originalFilename,
        source: 'official',
      }
    }
    catch (err) {
      if (!(err instanceof InvoicePdfServiceError && err.code === 'NO_PDF')) throw err
    }
  }

  const preview = await previewInvoicePdf(db, invoiceId)
  return {
    pdf: preview.pdf,
    filename: preview.filename,
    source: 'preview',
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
