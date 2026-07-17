import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const presetDir = join(process.cwd(), 'server/assets/invoice-template-presets')

/** Extract @php-defined variables and {{ $var }} CSS references from preset blades. */
function scanPresetBlade(filename: string) {
  const source = readFileSync(join(presetDir, filename), 'utf8')
  const phpBlock = source.match(/@php([\s\S]*?)@endphp/)?.[1] ?? ''
  const defined = new Set([...phpBlock.matchAll(/\$(\w+)\s*=/g)].map(m => m[1]))
  const used = new Set([...source.matchAll(/\{\{\s*\$(\w+)/g)].map(m => m[1]))
  const skip = new Set([
    'doc', 'line', 'company', 'customer', 'vehicle', 'lineItems', 'totals', 'sections',
    'm', 'paperCss', 'documentTitle', 'documentNumber', 'documentDate', 'statusLabel',
    'note', 'sectionVisible', 'sectionLabel', 'customerAddress', 'vehicleMakeModel',
    'fillerRows', 'i', 'key', 'fallback', 'label', 'line1', 'line2', 'cityLine',
    'locality', 'city', 'state', 'postal', 'fleet', 'tag', 'ymm', 'amt', 'badge',
    'lineAmount', 'lineType', 'type', 'description', 'quantity', 'unitPrice',
  ])
  const missing = [...used].filter(v => !defined.has(v) && !skip.has(v))
  return missing
}

describe('invoice template presets', () => {
  it('define CSS variables referenced in each preset blade', () => {
    const files = [
      'shop-matrix.blade.php',
      'aria-minimal.blade.php',
      'blueprint-trade.blade.php',
      'classic-ledger.blade.php',
      'executive-slate.blade.php',
      'onyx-bold.blade.php',
    ]
    for (const file of files) {
      expect(scanPresetBlade(file), file).toEqual([])
    }
  })
})
