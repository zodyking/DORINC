import { and, desc, eq } from 'drizzle-orm'
import type { Db } from '../db/client'
import type { InvoiceTemplateDesignSettings } from '../db/schema/invoice-templates'
import { invoiceTemplateVersions, invoiceTemplates } from '../db/schema/invoice-templates'
import {
  BLADE_INVOICE_TEMPLATE_VIEW,
  DEFAULT_INVOICE_TEMPLATE_DESIGN,
} from '../../shared/invoice-template-design'
import { isBuiltInBladeMarker } from '../../shared/invoice-template-blade'
import { readBuiltInInvoiceBladeSource, resolveTemplateBladeSource } from '../utils/invoice-blade-baseline'

/** Template source for invoice/estimate PDF rendering (Laravel Blade). */
export interface InvoicePdfTemplateSource {
  bladeView: typeof BLADE_INVOICE_TEMPLATE_VIEW
  designSettings: InvoiceTemplateDesignSettings
  bladeSource: string | null
  /** DB version id when a published designer template is active; null for built-in. */
  templateVersionId: string | null
  isBuiltIn: boolean
}

/** Built-in default invoice PDF template — always available without database seeding. */
export function getBuiltInInvoicePdfTemplate(): InvoicePdfTemplateSource {
  return {
    bladeView: BLADE_INVOICE_TEMPLATE_VIEW,
    designSettings: DEFAULT_INVOICE_TEMPLATE_DESIGN,
    bladeSource: null,
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

  let bladeSource: string | null = null
  if (!isBuiltInBladeMarker(row.version.layoutMarker)) {
    const baseline = await readBuiltInInvoiceBladeSource()
    bladeSource = resolveTemplateBladeSource(row.version.layoutMarker, baseline)
  }

  return {
    bladeView: BLADE_INVOICE_TEMPLATE_VIEW,
    designSettings: row.version.designSettings,
    bladeSource,
    templateVersionId: row.version.id,
    isBuiltIn: false,
  }
}

export function pdfRenderOptionsFromTemplate(template: InvoicePdfTemplateSource) {
  const marginInches = template.designSettings.marginInches ?? 0.5
  const paper = template.designSettings.pageSize === 'A4' ? 'a4' as const : 'letter' as const
  return {
    paper,
    marginInches,
    bladeSource: template.bladeSource ?? undefined,
  }
}
