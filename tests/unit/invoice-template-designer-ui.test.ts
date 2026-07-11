import { describe, expect, it } from 'vitest'
import { DEFAULT_INVOICE_TEMPLATE_DESIGN, mergeTemplateSections } from '../../shared/invoice-template-design'
import {
  designSettingsFromForm,
  detectFontPreset,
  previewSampleFromInvoice,
  previewStyleVars,
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
      logoFileId: null,
      sections: sectionsFromSettings(),
    })
    expect(settings.fontSans).toContain('Inter')
    expect(detectFontPreset(settings)).toBe('inter')
  })

  it('builds preview CSS vars from accent color', () => {
    const vars = previewStyleVars({ accentColor: '#ff0000', fontSans: TEMPLATE_FONT_OPTIONS[0]!.fontSans })
    expect(vars['--pv-accent']).toBe('#ff0000')
  })

  it('formats version and publish labels', () => {
    expect(versionStatusLabel('published', 2)).toBe('v2 · published')
    expect(publishStatusLabel('2026-07-08T16:00:00Z', 3)).toMatch(/Published v3/)
    expect(publishStatusLabel(null, 1, 46)).toMatch(/46 invoices/)
  })

  it('maps real invoice preview rows', () => {
    const sample = previewSampleFromInvoice({
      invoiceNumberFormatted: 'INV-000100',
      invoiceDate: '2026-07-01',
      dueDate: '2026-07-31',
      total: '100.00',
      balanceDue: '100.00',
      customerName: 'Acme Fleet',
      vehicleLabel: '2020 Freightliner',
      vin: 'VIN123',
      odometer: '100,000 mi',
      complaint: 'Oil leak',
      lineItems: [{ description: 'Labor', qty: '1', rate: '100.00', amount: '100.00' }],
      subtotal: '100.00',
      taxAmount: '0',
      discountAmount: '0',
      feesAmount: '0',
      paymentTerms: 'net_30',
    })
    expect(sample.invoiceNumber).toBe('INV-000100')
    expect(sample.customer).toBe('Acme Fleet')
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
