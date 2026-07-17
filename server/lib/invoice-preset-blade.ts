import { readFile } from 'node:fs/promises'
import { join } from 'node:path'

const PRESET_DIR_CANDIDATES = [
  join(process.cwd(), 'server/assets/invoice-template-presets'),
  join(process.cwd(), '../server/assets/invoice-template-presets'),
]

export const INVOICE_TEMPLATE_PRESET_FILES: ReadonlyArray<{ slug: string, name: string, file: string, setAsDefault?: boolean }> = [
  { slug: 'shop-matrix', name: 'Shop Matrix', file: 'shop-matrix.blade.php', setAsDefault: true },
  { slug: 'classic-ledger', name: 'Service Matrix', file: 'classic-ledger.blade.php' },
  { slug: 'onyx-bold', name: 'Onyx Bold', file: 'onyx-bold.blade.php' },
  { slug: 'aria-minimal', name: 'Aria Minimal', file: 'aria-minimal.blade.php' },
  { slug: 'executive-slate', name: 'Executive Slate', file: 'executive-slate.blade.php' },
  { slug: 'blueprint-trade', name: 'Blueprint Trade', file: 'blueprint-trade.blade.php' },
]

export const PRESET_BLADE_MARKER_PREFIX = 'preset:'

export function presetBladeMarkerForSlug(slug: string): string {
  return `${PRESET_BLADE_MARKER_PREFIX}${slug}`
}

export function isPresetBladeMarker(marker: string): boolean {
  return marker.trim().startsWith(PRESET_BLADE_MARKER_PREFIX)
}

export function parsePresetSlugFromMarker(marker: string): string | null {
  const trimmed = marker.trim()
  if (!trimmed.startsWith(PRESET_BLADE_MARKER_PREFIX)) return null
  const slug = trimmed.slice(PRESET_BLADE_MARKER_PREFIX.length).trim()
  return slug || null
}

export function presetFileForSlug(slug: string): string | null {
  return INVOICE_TEMPLATE_PRESET_FILES.find(p => p.slug === slug)?.file ?? null
}

export async function readPresetBladeFile(file: string): Promise<string> {
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

export async function readPresetBladeBySlug(slug: string): Promise<string> {
  const file = presetFileForSlug(slug)
  if (!file) throw new Error(`Unknown invoice template preset slug: ${slug}`)
  return readPresetBladeFile(file)
}
