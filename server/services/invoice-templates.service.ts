import { and, count, desc, eq, inArray, isNull, ne } from 'drizzle-orm'
import type { Db } from '../db/client'
import type { InvoiceTemplateDesignSettings } from '../db/schema/invoice-templates'
import {
  invoiceTemplateVersions,
  invoiceTemplates,
} from '../db/schema/invoice-templates'
import { invoiceFiles, invoices } from '../db/schema/invoices'
import { mergeTemplateSections, BLADE_INVOICE_TEMPLATE_MARKER } from '../../shared/invoice-template-design'
import {
  buildDocumentPdfRenderPayload,
  buildInvoicePdfData,
  serializePdfRenderPayload,
} from '../../shared/document-pdf-payload'
import { DEFAULT_INVOICE_TEMPLATE_SLUG } from '../db/seed-invoice-templates'
import { getInvoiceDetail } from './invoices.service'
import { renderDocumentPdfBuffer } from './laravel-pdf.service'
import { enqueuePdfRenderJob } from './pdf-render.service'
import { getBusinessProfile } from './workspace-settings.service'

export type InvoiceTemplatesServiceErrorCode
  = 'NOT_FOUND'
    | 'NO_VERSION'
    | 'DUPLICATE_SLUG'
    | 'CANNOT_ARCHIVE_DEFAULT'
    | 'NO_PREVIEW_INVOICE'

export class InvoiceTemplatesServiceError extends Error {
  constructor(public readonly code: InvoiceTemplatesServiceErrorCode) {
    super(code)
  }
}

export interface PublishInvoiceTemplateInput {
  designSettings: InvoiceTemplateDesignSettings
}

export async function ensureDefaultInvoiceTemplate(db: Db) {
  const [row] = await db.select({ id: invoiceTemplates.id })
    .from(invoiceTemplates)
    .where(isNull(invoiceTemplates.archivedAt))
    .limit(1)
  if (row) return

  try {
    const { seedInvoiceTemplates } = await import('../db/seed-invoice-templates')
    await seedInvoiceTemplates(db)
  }
  catch (err) {
    const [again] = await db.select({ id: invoiceTemplates.id })
      .from(invoiceTemplates)
      .where(isNull(invoiceTemplates.archivedAt))
      .limit(1)
    if (again) return
    throw err
  }
}

export async function listInvoiceTemplates(db: Db) {
  const templates = await db.select().from(invoiceTemplates)
    .where(isNull(invoiceTemplates.archivedAt))
    .orderBy(invoiceTemplates.name)

  const rows = await Promise.all(templates.map(async (template) => {
    const latest = await getLatestTemplateVersion(db, template.id)
    const usageCount = await countTemplateUsage(db, template.id)
    return {
      ...template,
      usageCount,
      latestVersion: latest
        ? {
            id: latest.id,
            versionNumber: latest.versionNumber,
            status: latest.status,
            publishedAt: latest.publishedAt,
          }
        : null,
    }
  }))

  return rows
}

export async function countTemplateUsage(db: Db, templateId: string) {
  const versionRows = await db.select({ id: invoiceTemplateVersions.id })
    .from(invoiceTemplateVersions)
    .where(eq(invoiceTemplateVersions.templateId, templateId))
  const versionIds = versionRows.map(r => r.id)
  if (!versionIds.length) return 0

  try {
    const [row] = await db.select({ value: count() })
      .from(invoiceFiles)
      .where(inArray(invoiceFiles.templateVersionId, versionIds))
    return Number(row?.value ?? 0)
  }
  catch (err) {
    // Production DBs mid-migration may not have invoice_files yet (0013 / 0036 repair).
    const code = (err as { cause?: { code?: string } })?.cause?.code
    if (code === '42P01') return 0
    throw err
  }
}

export async function getInvoiceTemplateById(db: Db, id: string) {
  const [template] = await db.select().from(invoiceTemplates).where(eq(invoiceTemplates.id, id))
  return template ?? null
}

export async function getDefaultInvoiceTemplate(db: Db) {
  const [byDefault] = await db.select().from(invoiceTemplates)
    .where(eq(invoiceTemplates.isDefault, true))
    .limit(1)
  if (byDefault) return byDefault

  const [bySlug] = await db.select().from(invoiceTemplates)
    .where(eq(invoiceTemplates.slug, DEFAULT_INVOICE_TEMPLATE_SLUG))
    .limit(1)
  return bySlug ?? null
}

export async function getLatestTemplateVersion(db: Db, templateId: string) {
  const [row] = await db.select().from(invoiceTemplateVersions)
    .where(eq(invoiceTemplateVersions.templateId, templateId))
    .orderBy(desc(invoiceTemplateVersions.versionNumber))
    .limit(1)
  return row ?? null
}

export async function getLatestPublishedTemplateVersion(db: Db, templateId: string) {
  const [row] = await db.select().from(invoiceTemplateVersions)
    .where(and(
      eq(invoiceTemplateVersions.templateId, templateId),
      eq(invoiceTemplateVersions.status, 'published'),
    ))
    .orderBy(desc(invoiceTemplateVersions.versionNumber))
    .limit(1)
  return row ?? null
}

export async function getInvoiceTemplateDetail(db: Db, templateId: string) {
  const template = await getInvoiceTemplateById(db, templateId)
  if (!template) return null

  const latestVersion = await getLatestTemplateVersion(db, templateId)
  const publishedVersion = await getLatestPublishedTemplateVersion(db, templateId)
  const usageCount = await countTemplateUsage(db, templateId)

  return {
    template,
    latestVersion,
    publishedVersion,
    usageCount,
  }
}

function logoPreviewPath(fileId: string | null | undefined) {
  return fileId ? `/api/files/${fileId}/preview` : null
}

export async function publishInvoiceTemplateVersion(
  db: Db,
  templateId: string,
  input: PublishInvoiceTemplateInput,
  actorId: string,
) {
  const template = await getInvoiceTemplateById(db, templateId)
  if (!template) throw new InvoiceTemplatesServiceError('NOT_FOUND')

  const latest = await getLatestTemplateVersion(db, templateId)
  if (!latest) throw new InvoiceTemplatesServiceError('NO_VERSION')

  const designSettings: InvoiceTemplateDesignSettings = {
    ...latest.designSettings,
    ...input.designSettings,
    sections: mergeTemplateSections({
      ...latest.designSettings.sections,
      ...input.designSettings.sections,
    }),
  }

  const [version] = await db.insert(invoiceTemplateVersions).values({
    templateId,
    versionNumber: latest.versionNumber + 1,
    status: 'published',
    htmlContent: BLADE_INVOICE_TEMPLATE_MARKER,
    designSettings,
    publishedAt: new Date(),
    publishedBy: actorId,
    createdBy: actorId,
  }).returning()

  await db.update(invoiceTemplateVersions)
    .set({ status: 'archived' })
    .where(and(
      eq(invoiceTemplateVersions.templateId, templateId),
      eq(invoiceTemplateVersions.status, 'published'),
      ne(invoiceTemplateVersions.id, version!.id),
    ))

  await db.update(invoiceTemplates)
    .set({ updatedAt: new Date() })
    .where(eq(invoiceTemplates.id, templateId))

  return version!
}

function slugifyTemplateName(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 48) || 'template'
}

export async function duplicateInvoiceTemplate(
  db: Db,
  templateId: string,
  actorId: string,
  name?: string,
) {
  const detail = await getInvoiceTemplateDetail(db, templateId)
  if (!detail?.latestVersion) throw new InvoiceTemplatesServiceError('NOT_FOUND')

  const baseName = name?.trim() || `${detail.template.name} (copy)`
  let slug = slugifyTemplateName(baseName)
  const existing = await db.select({ id: invoiceTemplates.id }).from(invoiceTemplates)
    .where(eq(invoiceTemplates.slug, slug))
  if (existing.length) slug = `${slug}-${Date.now().toString(36)}`

  const [template] = await db.insert(invoiceTemplates).values({
    name: baseName,
    slug,
    isDefault: false,
    createdBy: actorId,
  }).returning()

  const sourceVersion = detail.publishedVersion ?? detail.latestVersion
  await db.insert(invoiceTemplateVersions).values({
    templateId: template!.id,
    versionNumber: 1,
    status: 'draft',
    htmlContent: BLADE_INVOICE_TEMPLATE_MARKER,
    designSettings: sourceVersion.designSettings,
    createdBy: actorId,
  })

  return getInvoiceTemplateDetail(db, template!.id)
}

export async function archiveInvoiceTemplate(db: Db, templateId: string) {
  const template = await getInvoiceTemplateById(db, templateId)
  if (!template) throw new InvoiceTemplatesServiceError('NOT_FOUND')
  if (template.isDefault) throw new InvoiceTemplatesServiceError('CANNOT_ARCHIVE_DEFAULT')

  await db.update(invoiceTemplates)
    .set({ archivedAt: new Date(), updatedAt: new Date(), isDefault: false })
    .where(eq(invoiceTemplates.id, templateId))

  return getInvoiceTemplateById(db, templateId)
}

export async function setDefaultInvoiceTemplate(db: Db, templateId: string) {
  const template = await getInvoiceTemplateById(db, templateId)
  if (!template || template.archivedAt) throw new InvoiceTemplatesServiceError('NOT_FOUND')

  await db.update(invoiceTemplates).set({ isDefault: false }).where(eq(invoiceTemplates.isDefault, true))
  await db.update(invoiceTemplates)
    .set({ isDefault: true, updatedAt: new Date() })
    .where(eq(invoiceTemplates.id, templateId))

  return getInvoiceTemplateById(db, templateId)
}

export async function getTemplatePreviewInvoice(db: Db) {
  const [row] = await db.select({ id: invoices.id })
    .from(invoices)
    .where(and(
      isNull(invoices.archivedAt),
      inArray(invoices.status, ['sent', 'paid', 'approved']),
    ))
    .orderBy(desc(invoices.updatedAt), desc(invoices.createdAt))
    .limit(1)

  if (!row) return null

  const detail = await getInvoiceDetail(db, row.id)
  return {
    id: detail.id,
    invoiceNumberFormatted: detail.invoiceNumberFormatted,
    status: detail.status,
    invoiceDate: detail.invoiceDate,
    dueDate: detail.dueDate,
    total: detail.total,
    balanceDue: detail.balanceDue,
    customerName: detail.customerSnapshot.displayName,
    vehicleLabel: detail.vehicleSnapshot
      ? [detail.vehicleSnapshot.year, detail.vehicleSnapshot.make, detail.vehicleSnapshot.model].filter(Boolean).join(' ')
      : null,
    vin: detail.vehicleSnapshot?.vin ?? null,
    odometer: detail.vehicleSnapshot?.odometer ?? null,
    complaint: detail.complaint ?? detail.customerNotes ?? null,
    lineItems: detail.lineItems.map(line => ({
      description: line.description,
      qty: line.quantity,
      rate: line.unitPrice,
      amount: line.lineAmount,
    })),
    subtotal: detail.subtotal,
    taxAmount: detail.taxAmount,
    discountAmount: detail.discountAmount,
    feesAmount: detail.feesAmount,
    paymentTerms: detail.paymentTerms,
  }
}

export interface TestRenderTemplatePdfInput {
  designSettings?: InvoiceTemplateDesignSettings
}

export async function previewTemplatePdf(
  db: Db,
  templateId: string,
  previewDesignSettings?: InvoiceTemplateDesignSettings,
) {
  const detail = await getInvoiceTemplateDetail(db, templateId)
  if (!detail?.latestVersion) throw new InvoiceTemplatesServiceError('NOT_FOUND')

  const preview = await getTemplatePreviewInvoice(db)
  if (!preview) throw new InvoiceTemplatesServiceError('NO_PREVIEW_INVOICE')

  const invoiceDetail = await getInvoiceDetail(db, preview.id)
  const business = await getBusinessProfile(db)
  const baseSettings = detail.publishedVersion?.designSettings ?? detail.latestVersion.designSettings
  const designSettings: InvoiceTemplateDesignSettings = previewDesignSettings
    ? {
        ...baseSettings,
        ...previewDesignSettings,
        sections: mergeTemplateSections({
          ...baseSettings.sections,
          ...previewDesignSettings.sections,
        }),
      }
    : baseSettings
  const data = buildInvoicePdfData(invoiceDetail, {
    company: { name: business.businessName || undefined },
    design: designSettings,
    logoUrl: logoPreviewPath(designSettings.logoFileId),
  })
  const marginInches = designSettings.marginInches
  const paper = designSettings.pageSize === 'A4' ? 'a4' as const : 'letter' as const
  const payload = buildDocumentPdfRenderPayload(data, { paper, marginInches })
  const pdf = await renderDocumentPdfBuffer(payload)

  return {
    pdf,
    previewInvoiceNumber: preview.invoiceNumberFormatted,
  }
}

export async function testRenderTemplatePdf(
  db: Db,
  templateId: string,
  input: TestRenderTemplatePdfInput,
  actorId: string,
) {
  const detail = await getInvoiceTemplateDetail(db, templateId)
  if (!detail?.latestVersion) throw new InvoiceTemplatesServiceError('NOT_FOUND')

  const preview = await getTemplatePreviewInvoice(db)
  if (!preview) throw new InvoiceTemplatesServiceError('NO_PREVIEW_INVOICE')

  const invoiceDetail = await getInvoiceDetail(db, preview.id)
  const business = await getBusinessProfile(db)

  const mergedSettings: InvoiceTemplateDesignSettings = input.designSettings
    ? {
        ...detail.latestVersion.designSettings,
        ...input.designSettings,
        sections: mergeTemplateSections({
          ...detail.latestVersion.designSettings.sections,
          ...input.designSettings.sections,
        }),
      }
    : detail.latestVersion.designSettings

  const data = buildInvoicePdfData(invoiceDetail, {
    company: { name: business.businessName || undefined },
    design: mergedSettings,
    logoUrl: logoPreviewPath(mergedSettings.logoFileId),
  })
  const paper = mergedSettings.pageSize === 'A4' ? 'a4' as const : 'letter' as const
  const payload = buildDocumentPdfRenderPayload(data, {
    paper,
    marginInches: mergedSettings.marginInches,
  })

  const job = await enqueuePdfRenderJob(db, {
    entityType: 'invoice',
    entityId: preview.id,
    htmlContent: serializePdfRenderPayload(payload),
    originalFilename: `template-test-${detail.template.slug}.pdf`,
    templateVersionId: null,
    createdBy: actorId,
  })

  return { job, previewInvoiceId: preview.id }
}
