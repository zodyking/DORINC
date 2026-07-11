import { describe, expect, it } from 'vitest'
import { DEFAULT_INVOICE_TEMPLATE_DESIGN, mergeTemplateSections } from '../../shared/invoice-template-design'
import {
  designSettingsFromForm,
  detectFontPreset,
  publishStatusLabel,
  sectionVisible,
  sectionsFromSettings,
  TEMPLATE_FONT_OPTIONS,
  versionStatusLabel,
} from '../../app/utils/invoice-template-designer-ui'

describe('invoice-template-designer-ui helpers (P1-30)', () => {
  it('maps font presets to design settings', () => {
    const settings = designSettingsFromForm({
      pageSize: 'Letter',
      marginInches: 0.5,
      accentColor: '#ffd400',
      accentColor2: '#0b0f1a',
      fontPreset: 'inter',
      sections: sectionsFromSettings(),
    })
    expect(settings.fontSans).toContain('Inter')
    expect(detectFontPreset(settings)).toBe('inter')
  })

  it('formats version and publish labels', () => {
    expect(versionStatusLabel('published', 2)).toBe('v2 · published')
    expect(publishStatusLabel('2026-07-08T16:00:00Z', 3)).toMatch(/Published v3/)
    expect(publishStatusLabel(null, 1, 46)).toMatch(/46 invoices/)
  })

  it('respects section visibility flags', () => {
    const sections = sectionsFromSettings({
      ...DEFAULT_INVOICE_TEMPLATE_DESIGN,
      sections: { vehicle: { visible: false, label: 'Vehicle' } },
    })
    expect(sectionVisible(sections, 'vehicle')).toBe(false)
    expect(sectionVisible(sections, 'line_items')).toBe(true)
    expect(mergeTemplateSections(sections).vehicle.visible).toBe(false)
  })
})
