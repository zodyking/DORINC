import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { and, desc, eq } from 'drizzle-orm'
import type { Db } from './client'
import {
  DEFAULT_INVOICE_TEMPLATE_DESIGN,
  invoiceTemplateVersions,
  invoiceTemplates,
} from './schema/invoice-templates'

export const DEFAULT_INVOICE_TEMPLATE_SLUG = 'professional-bill-matrix'
export const DEFAULT_INVOICE_TEMPLATE_NAME = 'Professional Bill Matrix'

/** Production ships this under server/assets; Agent-Files is local-dev only. */
export function resolveInvoiceTemplateReferencePath(): string {
  const candidates = [
    join(process.cwd(), 'server', 'assets', 'invoice-template-reference.html'),
    join(process.cwd(), 'Agent-Files', 'invoice-template-reference.html'),
  ]
  for (const path of candidates) {
    if (existsSync(path)) return path
  }
  throw new Error(
    `Missing invoice template reference HTML. Expected one of:\n${candidates.map(p => `  - ${p}`).join('\n')}`,
  )
}

function loadReferenceHtml(): string {
  return readFileSync(resolveInvoiceTemplateReferencePath(), 'utf8')
}

/** Idempotent seed — default template published as v1 (P1-27). */
export async function seedInvoiceTemplates(db: Db) {
  const htmlContent = loadReferenceHtml()

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
    await db.insert(invoiceTemplateVersions).values({
      templateId: template!.id,
      versionNumber: 1,
      status: 'published',
      htmlContent,
      designSettings: DEFAULT_INVOICE_TEMPLATE_DESIGN,
      publishedAt: new Date(),
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
