import { describe, expect, it } from 'vitest'
import { applyDesignSettingsToHtml, applySectionVisibilityToHtml } from '../../shared/invoice-template-html'
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

const SAMPLE_HTML = `<!doctype html>
<style>
  @page { size: Letter; margin: 0.5in; }
  :root{
    --accent:#ffd400; --accent2:#0b0f1a;
    --sans: ui-sans-serif, system-ui; --mono: ui-monospace;
  }
</style>
<body><div class="logo">DOR<br/>INC</div></body>`

describe('invoice-template-html (P1-30)', () => {
  it('patches CSS variables and page size in stored HTML', () => {
    const out = applyDesignSettingsToHtml(SAMPLE_HTML, {
      ...DEFAULT_INVOICE_TEMPLATE_DESIGN,
      accentColor: '#4f46e5',
      pageSize: 'A4',
      marginInches: 0.75,
    })
    expect(out).toContain('--accent:#4f46e5;')
    expect(out).toContain('size: A4; margin: 0.75in')
  })

  it('injects logo preview path when logoFileId is set', () => {
    const out = applyDesignSettingsToHtml(SAMPLE_HTML, {
      ...DEFAULT_INVOICE_TEMPLATE_DESIGN,
      logoFileId: '00000000-0000-4000-8000-000000000001',
    }, '/api/files/00000000-0000-4000-8000-000000000001/preview')
    expect(out).toContain('<img src="/api/files/00000000-0000-4000-8000-000000000001/preview"')
  })
})

describe('invoice-template-designer-ui helpers (P1-30)', () => {
  it('maps font presets to design settings', () => {
    const settings = designSettingsFromForm({
      pageSize: 'Letter',
      marginInches: 0.5,
      accentColor: '#ffd400',
      accentColor2: '#0b0f1a',
      fontPreset: 'inter',
      logoFileId: null,
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

describe('invoice-template-html sections (P3-05)', () => {
  it('hides sections via injected CSS', () => {
    const html = '<html><head></head><body><div data-section="footer">x</div></body></html>'
    const out = applySectionVisibilityToHtml(html, {
      sections: { footer: { visible: false, label: 'Footer' } },
    })
    expect(out).toContain('[data-section="footer"]{ display:none')
  })
})
