import { and, desc, eq } from 'drizzle-orm'
import type { Db } from './client'
import { loadInvoiceTemplateReferenceHtml } from '../assets/invoice-template-reference.loader'
import {
  DEFAULT_INVOICE_TEMPLATE_DESIGN,
  invoiceTemplateVersions,
  invoiceTemplates,
} from './schema/invoice-templates'

export const DEFAULT_INVOICE_TEMPLATE_SLUG = 'dot-matrix-ledger'
export const DEFAULT_INVOICE_TEMPLATE_NAME = 'Dot Matrix Ledger'

export { resolveInvoiceTemplateReferencePath } from '../assets/invoice-template-reference.loader'

/** Idempotent seed — default template published as v1 (P1-27). */
export async function seedInvoiceTemplates(db: Db) {
  const htmlContent = loadInvoiceTemplateReferenceHtml()

  const [template] = await db.insert(invoiceTemplates)
    .values({
      name: DEFAULT_INVOICE_TEMPLATE_NAME,
      slug: DEFAULT_INVOICE_TEMPLATE_SLUG,
      isDefault: true,
    })
    .onConflictDoUpdate({
      target: invoiceTemplates.slug,
      set: {
        name: DEFAULT_INVOICE_TEMPLATE_NAME,
        isDefault: true,
        updatedAt: new Date(),
      },
    })
    .returning()

  const existingVersion = await db.select()
    .from(invoiceTemplateVersions)
    .where(and(
      eq(invoiceTemplateVersions.templateId, template!.id),
      eq(invoiceTemplateVersions.versionNumber, 1),
    ))
    .limit(1)

  if (existingVersion.length === 0) {
    await db.insert(invoiceTemplateVersions)
      .values({
        templateId: template!.id,
        versionNumber: 1,
        status: 'published',
        htmlContent,
        designSettings: DEFAULT_INVOICE_TEMPLATE_DESIGN,
        publishedAt: new Date(),
      })
      .onConflictDoNothing({
        target: [invoiceTemplateVersions.templateId, invoiceTemplateVersions.versionNumber],
      })
  }
  else {
    await db.update(invoiceTemplateVersions)
      .set({ htmlContent })
      .where(and(
        eq(invoiceTemplateVersions.templateId, template!.id),
        eq(invoiceTemplateVersions.versionNumber, 1),
      ))
  }

  const published = await db.select()
    .from(invoiceTemplateVersions)
    .where(and(
      eq(invoiceTemplateVersions.templateId, template!.id),
      eq(invoiceTemplateVersions.status, 'published'),
    ))
    .orderBy(desc(invoiceTemplateVersions.versionNumber))
    .limit(1)

  const [v1Row] = await db.select()
    .from(invoiceTemplateVersions)
    .where(and(
      eq(invoiceTemplateVersions.templateId, template!.id),
      eq(invoiceTemplateVersions.versionNumber, 1),
    ))
    .limit(1)

  return {
    template: template!,
    publishedVersion: published[0] ?? v1Row!,
    baselineVersion: v1Row ?? published[0]!,
  }
}
