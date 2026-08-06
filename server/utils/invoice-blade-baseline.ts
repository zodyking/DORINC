import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import {
  isBuiltInBladeMarker,
  isLegacyAccentBladeSource,
  isPresetBladeMarker,
  parsePresetSlugFromMarker,
} from '../../shared/invoice-template-blade'
import { BLADE_INVOICE_TEMPLATE_VIEW } from '../../shared/invoice-template-design'
import { readPresetBladeBySlug } from '../lib/invoice-preset-blade'

let cachedBaseline: string | null = null

const BLADE_BASELINE_CANDIDATE_PATHS = [
  // Shipped with nuxt-app production image (see docker/Dockerfile.app).
  join(process.cwd(), 'server/assets/invoice-blade-baseline.blade.php'),
  // Monorepo dev / full checkout fallback.
  join(process.cwd(), 'services/laravel-pdf/resources/views/invoices/pdf.blade.php'),
]

/** Read the shipped Laravel Blade invoice template from disk. */
export async function readBuiltInInvoiceBladeSource(): Promise<string> {
  if (cachedBaseline) return cachedBaseline

  let lastError: unknown
  for (const path of BLADE_BASELINE_CANDIDATE_PATHS) {
    try {
      cachedBaseline = await readFile(path, 'utf8')
      return cachedBaseline
    }
    catch (err) {
      lastError = err
    }
  }

  throw lastError ?? new Error('Invoice Blade baseline template not found')
}

/**
 * Expand a stored layout marker (built-in / preset) to Blade source for the template editor.
 * Inline Blade is returned unchanged.
 */
export async function resolveBladeSourceForEditor(layoutMarker: string): Promise<string> {
  const marker = layoutMarker.trim()
  if (isPresetBladeMarker(marker)) {
    const slug = parsePresetSlugFromMarker(marker)
    if (!slug) throw new Error('Invalid invoice template preset marker')
    return readPresetBladeBySlug(slug)
  }
  if (!marker || isBuiltInBladeMarker(marker) || isLegacyAccentBladeSource(marker)) {
    return readBuiltInInvoiceBladeSource()
  }
  return marker
}

export function resolveTemplateBladeSource(layoutMarker: string, baseline: string): string {
  if (isBuiltInBladeMarker(layoutMarker)) return baseline
  return layoutMarker
}

export { BLADE_INVOICE_TEMPLATE_VIEW }
