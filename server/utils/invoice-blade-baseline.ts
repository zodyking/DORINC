import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { isBuiltInBladeMarker } from '../../shared/invoice-template-blade'
import { BLADE_INVOICE_TEMPLATE_VIEW } from '../../shared/invoice-template-design'

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

export function resolveTemplateBladeSource(layoutMarker: string, baseline: string): string {
  if (!isBuiltInBladeMarker(layoutMarker)) return layoutMarker
  return baseline
}

export { BLADE_INVOICE_TEMPLATE_VIEW }
