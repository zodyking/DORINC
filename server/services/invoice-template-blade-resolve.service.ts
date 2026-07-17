import { eq } from 'drizzle-orm'
import type { Db } from '../db/client'
import { invoiceTemplateVersions } from '../db/schema/invoice-templates'
import {
  isPresetBladeMarker,
  parsePresetSlugFromMarker,
  presetFileForSlug,
  readPresetBladeBySlug,
  readPresetBladeFile,
} from '../lib/invoice-preset-blade'
import { isSystemTemplateSlug } from '../db/seed-invoice-templates'
import { isBuiltInBladeMarker, isLegacyAccentBladeSource } from '../../shared/invoice-template-blade'

/** True when any version was created or published by a user (not system seed). */
export async function invoiceTemplateWasUserEdited(db: Db, templateId: string): Promise<boolean> {
  const versions = await db.select({
    createdBy: invoiceTemplateVersions.createdBy,
    publishedBy: invoiceTemplateVersions.publishedBy,
  })
    .from(invoiceTemplateVersions)
    .where(eq(invoiceTemplateVersions.templateId, templateId))

  return versions.some(v => v.createdBy != null || v.publishedBy != null)
}

/**
 * Resolve the Blade source used for PDF rendering.
 * System presets always load from shipped files unless the user edited the template.
 */
export async function resolveBladeSourceForPdf(
  db: Db,
  input: {
    templateId: string
    templateSlug: string
    layoutMarker: string
  },
): Promise<string | null> {
  const marker = input.layoutMarker.trim()

  if (isBuiltInBladeMarker(marker)) return null
  if (isLegacyAccentBladeSource(marker)) return null

  if (isPresetBladeMarker(marker)) {
    const slug = parsePresetSlugFromMarker(marker)
    if (slug) return readPresetBladeBySlug(slug)
  }

  if (isSystemTemplateSlug(input.templateSlug)) {
    const userEdited = await invoiceTemplateWasUserEdited(db, input.templateId)
    if (!userEdited) {
      const file = presetFileForSlug(input.templateSlug)
      if (file) return readPresetBladeFile(file)
    }
  }

  return marker
}
