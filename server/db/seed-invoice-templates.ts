import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { and, desc, eq, inArray } from 'drizzle-orm'
import type { Db } from './client'
import { BLADE_INVOICE_TEMPLATE_MARKER } from '../../shared/invoice-template-design'
import {
  DEFAULT_INVOICE_TEMPLATE_DESIGN,
  invoiceTemplateVersions,
  invoiceTemplates,
} from './schema/invoice-templates'

export const DEFAULT_INVOICE_TEMPLATE_SLUG = 'standard-invoice'
export const DEFAULT_INVOICE_TEMPLATE_NAME = 'Standard Invoice'

/**
 * Built-in template presets shipped with the app (server/assets).
 * Each seeds as its own template with the Blade source stored inline, so
 * users can pick, duplicate, and customize them from the designer.
 */
export const INVOICE_TEMPLATE_PRESETS: ReadonlyArray<{ slug: string, name: string, file: string }> = [
  { slug: 'classic-ledger', name: 'Classic Ledger', file: 'classic-ledger.blade.php' },
  { slug: 'onyx-bold', name: 'Onyx Bold', file: 'onyx-bold.blade.php' },
  { slug: 'aria-minimal', name: 'Aria Minimal', file: 'aria-minimal.blade.php' },
  { slug: 'executive-slate', name: 'Executive Slate', file: 'executive-slate.blade.php' },
  { slug: 'blueprint-trade', name: 'Blueprint Trade', file: 'blueprint-trade.blade.php' },
]

const PRESET_DIR_CANDIDATES = [
  // Shipped with nuxt-app production image (see docker/Dockerfile.app).
  join(process.cwd(), 'server/assets/invoice-template-presets'),
  // Monorepo dev / test fallback (cwd may be repo root already).
  join(process.cwd(), '../server/assets/invoice-template-presets'),
]

async function readPresetBladeSource(file: string): Promise<string> {
  let lastError: unknown
  for (const dir of PRESET_DIR_CANDIDATES) {
    try {
      return await readFile(join(dir, file), 'utf8')
    }
    catch (err) {
      lastError = err
    }
  }
  throw lastError ?? new Error(`Invoice template preset not found: ${file}`)
}

/**
 * Idempotent seed of built-in template presets. Inserts only presets whose
 * slug does not exist yet (archived ones stay archived — never re-added).
 */
export async function seedInvoiceTemplatePresets(db: Db) {
  const presetSlugs = INVOICE_TEMPLATE_PRESETS.map(p => p.slug)
  const existing = await db.select({ slug: invoiceTemplates.slug })
    .from(invoiceTemplates)
    .where(inArray(invoiceTemplates.slug, presetSlugs))
  const existingSlugs = new Set(existing.map(r => r.slug))

  let inserted = 0
  for (const preset of INVOICE_TEMPLATE_PRESETS) {
    if (existingSlugs.has(preset.slug)) continue

    const bladeSource = await readPresetBladeSource(preset.file)
    const [template] = await db.insert(invoiceTemplates)
      .values({ name: preset.name, slug: preset.slug, isDefault: false })
      .onConflictDoNothing({ target: invoiceTemplates.slug })
      .returning()
    if (!template) continue

    await db.insert(invoiceTemplateVersions)
      .values({
        templateId: template.id,
        versionNumber: 1,
        status: 'published',
        layoutMarker: bladeSource,
        designSettings: DEFAULT_INVOICE_TEMPLATE_DESIGN,
        publishedAt: new Date(),
      })
      .onConflictDoNothing({
        target: [invoiceTemplateVersions.templateId, invoiceTemplateVersions.versionNumber],
      })
    inserted += 1
  }

  return { inserted, total: INVOICE_TEMPLATE_PRESETS.length }
}

/** Idempotent seed — default template published as v1 (P1-27). */
export async function seedInvoiceTemplates(db: Db) {
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
        layoutMarker: BLADE_INVOICE_TEMPLATE_MARKER,
        designSettings: DEFAULT_INVOICE_TEMPLATE_DESIGN,
        publishedAt: new Date(),
      })
      .onConflictDoNothing({
        target: [invoiceTemplateVersions.templateId, invoiceTemplateVersions.versionNumber],
      })
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
