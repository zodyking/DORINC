import { and, desc, eq } from 'drizzle-orm'
import type { Db } from '../db/client'
import type { InvoiceTemplateDesignSettings } from '../db/schema/invoice-templates'
import { invoiceTemplateVersions, invoiceTemplates } from '../db/schema/invoice-templates'
import { DEFAULT_INVOICE_TEMPLATE_DESIGN } from '../../shared/invoice-template-design'
import { applyDesignSettingsToHtml } from '../../shared/invoice-template-html'
import { loadInvoiceTemplateReferenceHtml } from '../assets/invoice-template-reference.loader'

/** Template source for invoice/estimate PDF rendering. */
export interface InvoicePdfTemplateSource {
  htmlContent: string
  designSettings: InvoiceTemplateDesignSettings
  /** DB version id when a published designer template is active; null for built-in. */
  templateVersionId: string | null
  isBuiltIn: boolean
}

/** Built-in default invoice PDF template — always available without database seeding. */
export function getBuiltInInvoicePdfTemplate(): InvoicePdfTemplateSource {
  return {
    htmlContent: loadInvoiceTemplateReferenceHtml(),
    designSettings: DEFAULT_INVOICE_TEMPLATE_DESIGN,
    templateVersionId: null,
    isBuiltIn: true,
  }
}

/**
 * Resolve the template used for PDF rendering.
 * Published default from the designer wins; otherwise the built-in template ships with the app.
 */
export async function resolveInvoicePdfTemplate(db: Db): Promise<InvoicePdfTemplateSource> {
  const [row] = await db.select({
    version: invoiceTemplateVersions,
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

  if (!row) return getBuiltInInvoicePdfTemplate()

  return {
    htmlContent: row.version.htmlContent,
    designSettings: row.version.designSettings,
    templateVersionId: row.version.id,
    isBuiltIn: false,
  }
}

function logoPreviewPath(fileId: string | null | undefined): string | null {
  if (!fileId) return null
  const base = process.env.APP_URL?.trim().replace(/\/$/, '')
  const path = `/api/files/${fileId}/preview`
  return base ? `${base}${path}` : path
}

/** Apply designer settings to template HTML before invoice data merge. */
export function prepareInvoiceTemplateHtml(template: InvoicePdfTemplateSource): string {
  return applyDesignSettingsToHtml(
    template.htmlContent,
    template.designSettings,
    logoPreviewPath(template.designSettings.logoFileId),
  )
}

export function pdfRenderOptionsFromTemplate(template: InvoicePdfTemplateSource) {
  const marginInches = template.designSettings.marginInches ?? 0.5
  const paper = template.designSettings.pageSize === 'A4' ? 'a4' as const : 'letter' as const
  return { paper, marginInches }
}
