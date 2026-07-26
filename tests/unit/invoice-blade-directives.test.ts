import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const BLADE_FILES = [
  'services/laravel-pdf/resources/views/invoices/pdf.blade.php',
  'server/assets/invoice-blade-baseline.blade.php',
  ...readdirSync(join(process.cwd(), 'server/assets/invoice-template-presets'))
    .filter(f => f.endsWith('.blade.php'))
    .map(f => `server/assets/invoice-template-presets/${f}`),
]

function bladeDirectiveDepth(source: string): number {
  const tokens = source.match(/@(if|elseif|else|endif|foreach|endforeach|forelse|empty|endforelse|for|endfor|php|endphp)\b/g) ?? []
  let depth = 0
  for (const token of tokens) {
    const name = token.slice(1)
    if (name === 'if' || name === 'foreach' || name === 'forelse' || name === 'for' || name === 'php') {
      depth += 1
    }
    else if (name === 'endif' || name === 'endforeach' || name === 'endforelse' || name === 'endfor' || name === 'endphp') {
      depth -= 1
      if (depth < 0) return depth
    }
  }
  return depth
}

describe('invoice blade directive balance', () => {
  for (const file of BLADE_FILES) {
    it(`balances @if/@endif in ${file}`, () => {
      const source = readFileSync(join(process.cwd(), file), 'utf8')
      expect(bladeDirectiveDepth(source)).toBe(0)
      expect(source).not.toMatch(/Tax@if\(!empty\(\$totals\['taxExempt'\]\)\)/)
    })
  }
})
