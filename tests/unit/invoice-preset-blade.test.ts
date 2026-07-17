import { describe, expect, it } from 'vitest'
import {
  isPresetBladeMarker,
  parsePresetSlugFromMarker,
  presetBladeMarkerForSlug,
  presetFileForSlug,
} from '../../server/lib/invoice-preset-blade'

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
})
