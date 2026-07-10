import { and, desc, eq, inArray } from 'drizzle-orm'
import type { Db } from '../db/client'
import type { InvoiceStatus } from '../db/schema/invoices'
import { invoiceFiles } from '../db/schema/invoices'
import { invoiceTemplateVersions, invoiceTemplates } from '../db/schema/invoice-templates'
import { pdfRenderJobs } from '../db/schema/pdf-render-jobs'
import { formatMoney, parseMoney } from '../../shared/money'
import { normalizeLineType } from '#shared/line-item-types'
import { applyDesignSettingsToHtml } from '../../shared/invoice-template-html'
import { getFileWithData } from './files.service'
import { renderHtmlToPdfBuffer } from './laravel-pdf.service'
import { enqueuePdfRenderJob } from './pdf-render.service'
import { getInvoiceDetail, InvoicesServiceError } from './invoices.service'

export type InvoicePdfServiceErrorCode
  = 'NOT_FOUND'
    | 'NOT_FINALIZED'
    | 'NO_PDF'
    | 'TEMPLATE_NOT_FOUND'

export class InvoicePdfServiceError extends Error {
  constructor(public readonly code: InvoicePdfServiceErrorCode) {
    super(code)
  }
}

/** Finalized invoices eligible for official PDF generation (SPEC §9). */
export const PDF_ELIGIBLE_STATUSES: InvoiceStatus[] = ['approved', 'sent', 'paid']

const LINE_TYPE_BADGE: Record<string, string> = {
  part: 'P',
  labor: 'L',
  fee: 'F',
}

const PAYMENT_TERMS_LABELS: Record<string, string> = {
  due_on_receipt: 'Due on receipt',
  net_15: 'Net 15',
  net_30: 'Net 30',
  net_45: 'Net 45',
  net_60: 'Net 60',
}

const STATUS_PDF_LABELS: Record<InvoiceStatus, string> = {
  draft: 'DRAFT',
  approved: 'APPROVED',
  sent: 'SENT',
  paid: 'PAID',
  void: 'VOID',
}

function logoPreviewPath(fileId: string | null | undefined) {
  return fileId ? `/api/files/${fileId}/preview` : null
}

function templateHtmlForRender(
  version: Awaited<ReturnType<typeof getDefaultPublishedTemplateVersion>>['version'],
) {
  return applyDesignSettingsToHtml(
    version.htmlContent,
    version.designSettings,
    logoPreviewPath(version.designSettings.logoFileId),
  )
}

function pdfOptionsFromTemplateVersion(
  version: Awaited<ReturnType<typeof getDefaultPublishedTemplateVersion>>['version'],
) {
  const marginInches = version.designSettings?.marginInches ?? 0.5
  const paper = version.designSettings?.pageSize === 'A4' ? 'a4' as const : 'letter' as const
  return { paper, marginInches }
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function moneyDisplay(value: string): string {
  return `$${formatMoney(parseMoney(value))}`
}

function formatDisplayDate(isoDate: string): string {
  const [year, month, day] = isoDate.split('-')
  return `${Number(month)}/${Number(day)}/${year}`
}

function formatGeneratedAt(date = new Date()): string {
  return date.toLocaleString('en-US', {
    month: '2-digit',
    day: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
  })
}

function paymentTermsLabel(terms: string): string {
  return PAYMENT_TERMS_LABELS[terms] ?? terms.replace(/_/g, ' ')
}

function formatAddress(addr: { line1: string, line2?: string | null, city: string, state: string, postalCode: string } | null): string {
  if (!addr) return '—'
  const line2 = addr.line2 ? `<br/>${escapeHtml(addr.line2)}` : ''
  return `${escapeHtml(addr.line1)}${line2}<br/>${escapeHtml(addr.city)}, ${escapeHtml(addr.state)} ${escapeHtml(addr.postalCode)}`
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

  if (!row) throw new InvoicePdfServiceError('TEMPLATE_NOT_FOUND')
  return row
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

/** Build render HTML from published template + frozen invoice snapshots (SPEC §9). */
export function buildInvoiceRenderHtml(
  templateHtml: string,
  detail: Awaited<ReturnType<typeof getInvoiceDetail>>,
): string {
  const invNum = detail.invoiceNumberFormatted
  const statusLabel = STATUS_PDF_LABELS[detail.status]
  const customer = detail.customerSnapshot
  const vehicle = detail.vehicleSnapshot
  const generatedAt = formatGeneratedAt()

  const lineRows = detail.lineItems.map((line) => {
    const badge = LINE_TYPE_BADGE[normalizeLineType(line.lineType)] ?? 'L'
    return `<tr>
              <td><div class="desc">${escapeHtml(line.description)}</div></td>
              <td class="center"><span class="type-badge">${badge}</span></td>
              <td class="center mono">${escapeHtml(line.quantity)}</td>
              <td class="num mono">${moneyDisplay(line.unitPrice)}</td>
              <td class="num mono">${moneyDisplay(line.lineAmount)}</td>
            </tr>`
  }).join('\n')

  const vehicleBlock = vehicle
    ? `<div class="lines mono">
              <div class="label">Unit #</div><div class="val">${escapeHtml(vehicle.busNumber ?? vehicle.unitTag ?? '—')}</div>
              <div class="label">Year</div><div class="val">${vehicle.year ?? '—'}</div>
              <div class="label">Make / Model</div><div class="val">${escapeHtml([vehicle.make, vehicle.model].filter(Boolean).join(' ') || '—')}</div>
              <div class="label">VIN</div><div class="val mono">${escapeHtml(vehicle.vin ?? '—')}</div>
              <div class="label">Plate</div><div class="val">${escapeHtml(vehicle.plate ?? 'Not on file')}</div>
            </div>`
    : `<div class="lines mono"><div class="label">Vehicle</div><div class="val muted">Not specified</div></div>`

  let html = templateHtml
    .replace(/<title>Invoice INV-\d+<\/title>/, `<title>Invoice ${invNum}</title>`)
    .replace(/INV-000081/g, invNum)
    .replace(/11\/27\/2025/g, formatDisplayDate(detail.invoiceDate))
    .replace(/Upon Receipt/g, paymentTermsLabel(detail.paymentTerms))
    .replace(/CREATED • NOT SENT/g, statusLabel)
    .replace(/Brandon Kadeem King/g, escapeHtml(customer.displayName))
    .replace(/387 Van Siclen Ave<br\/>\s*Brooklyn, NY 11207/g, formatAddress(customer.billingAddress ?? customer.serviceAddress))
    .replace(/\(212\) 203-7678/g, escapeHtml(customer.phone ?? '—'))
    .replace(/zodykinginbox@gmail.com/g, escapeHtml(customer.email ?? '—'))
    .replace(
      /<tbody>[\s\S]*?<\/tbody>/,
      `<tbody>\n${lineRows}\n          </tbody>`,
    )
    .replace(/\$915\.00/g, moneyDisplay(detail.total))
    .replace(/\$0\.00/g, moneyDisplay('0'))
    .replace(
      /<div class="vehicle-grid">[\s\S]*?<\/div>/,
      `<div class="vehicle-grid">\n            ${vehicleBlock}\n          </div>`,
    )
    .replace(
      /<div class="note">Engine making weird sounds[\s\S]*?<\/div>/,
      `<div class="note">${escapeHtml(detail.complaint ?? detail.customerNotes ?? '—')}</div>`,
    )
    .replace(
      /Generated 11\/27\/2025 03:18 AM/,
      `Generated ${generatedAt}`,
    )

  if (detail.taxAmount !== '0') {
    html = html.replace(
      /<div class="rowline"><div class="l">Tax<\/div><div class="r mono">\$0\.00<\/div><\/div>/,
      `<div class="rowline"><div class="l">Tax</div><div class="r mono">${moneyDisplay(detail.taxAmount)}</div></div>`,
    )
  }

  if (detail.discountAmount !== '0') {
    html = html.replace(
      /<div class="rowline"><div class="l">Discounts<\/div><div class="r mono">\$0\.00<\/div><\/div>/,
      `<div class="rowline"><div class="l">Discounts</div><div class="r mono">${moneyDisplay(detail.discountAmount)}</div></div>`,
    )
  }

  if (detail.feesAmount !== '0') {
    html = html.replace(
      /<div class="rowline"><div class="l">Shop Fees<\/div><div class="r mono">\$0\.00<\/div><\/div>/,
      `<div class="rowline"><div class="l">Shop Fees</div><div class="r mono">${moneyDisplay(detail.feesAmount)}</div></div>`,
    )
  }

  return html
}

export interface GenerateInvoicePdfResult {
  job: typeof pdfRenderJobs.$inferSelect | null
  invoiceFile: typeof invoiceFiles.$inferSelect | null
  alreadyExists: boolean
  templateVersionId: string
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
      templateVersionId: pending.templateVersionId!,
    }
  }

  const { version } = await getDefaultPublishedTemplateVersion(db)
  const templateHtml = templateHtmlForRender(version)
  const htmlContent = buildInvoiceRenderHtml(templateHtml, detail)
  const filename = `${detail.invoiceNumberFormatted}.pdf`

  const job = await enqueuePdfRenderJob(db, {
    entityType: 'invoice',
    entityId: invoiceId,
    htmlContent,
    originalFilename: filename,
    templateVersionId: version.id,
    createdBy: actorId,
  })

  return {
    job,
    invoiceFile: null,
    alreadyExists: false,
    templateVersionId: version.id,
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

/** Live DomPDF render for preview (any status) — does not store an official PDF. */
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

  let version
  try {
    ;({ version } = await getDefaultPublishedTemplateVersion(db))
  }
  catch (err) {
    if (err instanceof InvoicePdfServiceError && err.code === 'TEMPLATE_NOT_FOUND') {
      throw err
    }
    throw err
  }

  const templateHtml = templateHtmlForRender(version)
  const htmlContent = buildInvoiceRenderHtml(templateHtml, detail)
  const pdfOptions = pdfOptionsFromTemplateVersion(version)
  const pdf = await renderHtmlToPdfBuffer(htmlContent, pdfOptions)

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
