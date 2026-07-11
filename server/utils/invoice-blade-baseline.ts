import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { isBuiltInBladeMarker } from '../../shared/invoice-template-blade'
import { BLADE_INVOICE_TEMPLATE_VIEW } from '../../shared/invoice-template-design'

let cachedBaseline: string | null = null

/** Read the shipped Laravel Blade invoice template from disk. */
export async function readBuiltInInvoiceBladeSource(): Promise<string> {
  if (cachedBaseline) return cachedBaseline
  const path = join(process.cwd(), 'services/laravel-pdf/resources/views/invoices/pdf.blade.php')
  cachedBaseline = await readFile(path, 'utf8')
  return cachedBaseline
}

export function resolveTemplateBladeSource(layoutMarker: string, baseline: string): string {
  if (!isBuiltInBladeMarker(layoutMarker)) return layoutMarker
  return baseline
}

export { BLADE_INVOICE_TEMPLATE_VIEW }
