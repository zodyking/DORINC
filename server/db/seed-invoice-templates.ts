import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { and, desc, eq, inArray, ne } from 'drizzle-orm'
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
export const INVOICE_TEMPLATE_PRESETS: ReadonlyArray<{ slug: string, name: string, file: string, setAsDefault?: boolean }> = [
  { slug: 'shop-matrix', name: 'Shop Matrix', file: 'shop-matrix.blade.php', setAsDefault: true },
  { slug: 'classic-ledger', name: 'Service Matrix', file: 'classic-ledger.blade.php' },
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
 * Idempotent seed of built-in template presets.
 * - Missing slugs are inserted as published v1.
 * - Existing presets whose versions were all seeded (never edited by a user)
 *   are upgraded in place when the shipped Blade source changes.
 * - User-edited or archived presets are left untouched.
 */
export async function seedInvoiceTemplatePresets(db: Db) {
  const presetSlugs = INVOICE_TEMPLATE_PRESETS.map(p => p.slug)
  const existing = await db.select()
    .from(invoiceTemplates)
    .where(inArray(invoiceTemplates.slug, presetSlugs))
  const existingBySlug = new Map(existing.map(r => [r.slug, r]))

  let inserted = 0
  let upgraded = 0
  for (const preset of INVOICE_TEMPLATE_PRESETS) {
    const bladeSource = await readPresetBladeSource(preset.file)
    const template = existingBySlug.get(preset.slug)

    if (!template) {
      const shouldSetDefault = preset.setAsDefault === true
      if (shouldSetDefault) {
        await db.update(invoiceTemplates)
          .set({ isDefault: false })
          .where(eq(invoiceTemplates.isDefault, true))
      }

      const [row] = await db.insert(invoiceTemplates)
        .values({ name: preset.name, slug: preset.slug, isDefault: shouldSetDefault })
        .onConflictDoNothing({ target: invoiceTemplates.slug })
        .returning()
      if (!row) continue

      await db.insert(invoiceTemplateVersions)
        .values({
          templateId: row.id,
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
      continue
    }

    if (template.archivedAt) continue

    const versions = await db.select({
      id: invoiceTemplateVersions.id,
      versionNumber: invoiceTemplateVersions.versionNumber,
      layoutMarker: invoiceTemplateVersions.layoutMarker,
      createdBy: invoiceTemplateVersions.createdBy,
      publishedBy: invoiceTemplateVersions.publishedBy,
    })
      .from(invoiceTemplateVersions)
      .where(eq(invoiceTemplateVersions.templateId, template.id))
      .orderBy(desc(invoiceTemplateVersions.versionNumber))
    const latest = versions[0]
    if (!latest) continue

    // Seeded versions carry no actor ids; any actor means a user touched it.
    const userTouched = versions.some(v => v.createdBy !== null || v.publishedBy !== null)
    if (userTouched || latest.layoutMarker === bladeSource) continue

    const [version] = await db.insert(invoiceTemplateVersions)
      .values({
        templateId: template.id,
        versionNumber: latest.versionNumber + 1,
        status: 'published',
        layoutMarker: bladeSource,
        designSettings: DEFAULT_INVOICE_TEMPLATE_DESIGN,
        publishedAt: new Date(),
      })
      .onConflictDoNothing({
        target: [invoiceTemplateVersions.templateId, invoiceTemplateVersions.versionNumber],
      })
      .returning()
    if (!version) continue

    await db.update(invoiceTemplateVersions)
      .set({ status: 'archived' })
      .where(and(
        eq(invoiceTemplateVersions.templateId, template.id),
        eq(invoiceTemplateVersions.status, 'published'),
        ne(invoiceTemplateVersions.id, version.id),
      ))

    if (template.name !== preset.name) {
      await db.update(invoiceTemplates)
        .set({ name: preset.name, updatedAt: new Date() })
        .where(eq(invoiceTemplates.id, template.id))
    }
    upgraded += 1
  }

  return { inserted, upgraded, total: INVOICE_TEMPLATE_PRESETS.length }
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
