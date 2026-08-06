import { describe, expect, it } from 'vitest'
import {
  isPresetBladeMarker,
  parsePresetSlugFromMarker,
  presetBladeMarkerForSlug,
  presetFileForSlug,
  readPresetBladeBySlug,
} from '../../server/lib/invoice-preset-blade'
import { resolveBladeSourceForEditor } from '../../server/utils/invoice-blade-baseline'

describe('invoice preset blade markers', () => {
  it('maps slugs to preset markers', () => {
    expect(presetBladeMarkerForSlug('shop-matrix')).toBe('preset:shop-matrix')
    expect(isPresetBladeMarker('preset:shop-matrix')).toBe(true)
    expect(parsePresetSlugFromMarker('preset:shop-matrix')).toBe('shop-matrix')
  })

  it('resolves preset files for shipped slugs', () => {
    expect(presetFileForSlug('shop-matrix')).toBe('shop-matrix.blade.php')
    expect(presetFileForSlug('unknown')).toBeNull()
  })

  it('expands preset markers to Blade source for the template editor', async () => {
    const markers = [
      'preset:executive-slate',
      'preset:blueprint-trade',
      'preset:classic-ledger',
      'preset:shop-matrix',
      'preset:onyx-bold',
      'preset:aria-minimal',
    ] as const

    for (const marker of markers) {
      const slug = parsePresetSlugFromMarker(marker)!
      const fromEditor = await resolveBladeSourceForEditor(marker)
      const fromDisk = await readPresetBladeBySlug(slug)
      expect(fromEditor).toBe(fromDisk)
      expect(fromEditor.length).toBeGreaterThan(200)
      expect(fromEditor).not.toBe(marker)
      expect(fromEditor).toContain('@page')
    }
  })
})
