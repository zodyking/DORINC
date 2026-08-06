import { describe, expect, it } from 'vitest'
import { serviceLogSheetSettingsSchema } from '../../shared/validators/workspace-settings'
import {
  DEFAULT_SERVICE_LOG_SHEET_DOCUMENT,
  defaultServiceLogSheetDocument,
} from '../../shared/service-log-sheet-default'
import {
  formatSheetPrice,
  renderServiceLogSheetHtml,
  type ServiceLogSheetPayload,
  __testOnly,
} from '../../server/services/service-log-sheet.service'
import { formatSheetPriceDisplay } from '../../app/utils/service-log-sheet-display'

describe('service log sheet default template', () => {
  it('includes the Letter template sections in left and right columns', () => {
    const doc = defaultServiceLogSheetDocument()
    expect(doc.version).toBe(2)
    expect(doc.sections.some(s => s.title === 'Cleaning' && s.column === 'left')).toBe(true)
    expect(doc.sections.some(s => s.title === 'Battery' && s.column === 'right')).toBe(true)
    expect(doc.sections.some(s => s.title === 'Inspection' && s.column === 'right')).toBe(true)
    const steam = doc.sections.flatMap(s => s.items).find(i => i.name === 'Steam Clean Engine')
    expect(steam?.price).toBe('$35')
    const turbo = doc.sections.flatMap(s => s.items).find(i => i.subtext === '2004 to 2011')
    expect(turbo?.price).toBe('$2,950')
  })

  it('parses document settings schema', () => {
    const parsed = serviceLogSheetSettingsSchema.parse(DEFAULT_SERVICE_LOG_SHEET_DOCUMENT)
    expect(parsed.version).toBe(2)
    expect(parsed.sections.length).toBeGreaterThan(10)
  })
})

describe('formatSheetPrice', () => {
  it('formats whole dollars without cents and with commas', () => {
    expect(formatSheetPrice('35')).toBe('$35')
    expect(formatSheetPrice('1600.00')).toBe('$1,600')
    expect(formatSheetPrice('35.50')).toBe('$35.50')
  })

  it('matches client display helper', () => {
    expect(formatSheetPriceDisplay('1250')).toBe(formatSheetPrice('1250'))
  })
})

describe('renderServiceLogSheetHtml', () => {
  const payload: ServiceLogSheetPayload = {
    document: defaultServiceLogSheetDocument(),
    business: {
      businessName: 'Devon Onsite Repairs INC',
      phone: '(646) 731-7021',
      email: 'accounting@devononsiterepairs.com',
      addressLine: '387 Van Siclen Ave, Brooklyn, NY 11207',
    },
    catalogItems: [],
  }

  it('renders Letter two-column template content', () => {
    const html = renderServiceLogSheetHtml(payload)
    expect(html).toContain('Devon Onsite Repairs INC')
    expect(html).toContain('Steam Clean Engine')
    expect(html).toContain('Replace Heavy Duty Battery')
    expect(html).toContain('1000 cranking amps')
    expect(html).toContain('Inspection Service')
    expect(html).toContain('$3,750')
    expect(html).toContain('catalog-grid')
    expect(html).toContain('Customer Complaint or Vehicle Symptoms')
    // DomPDF-friendly table layout (not CSS grid columns)
    expect(html).toContain('<table class="catalog-grid">')
  })

  it('places Cleaning on the left and Battery on the right', () => {
    const html = renderServiceLogSheetHtml(payload)
    const leftIdx = html.indexOf('Cleaning')
    const batteryIdx = html.indexOf('Battery')
    const gridIdx = html.indexOf('catalog-grid')
    expect(leftIdx).toBeGreaterThan(gridIdx)
    expect(batteryIdx).toBeGreaterThan(leftIdx)
  })

  it('escapes HTML in names', () => {
    const html = renderServiceLogSheetHtml({
      ...payload,
      business: { ...payload.business, businessName: 'A <B> & "C"' },
      document: {
        version: 2,
        sections: [{
          id: 'x',
          title: 'Cat <script>',
          column: 'left',
          items: [{
            id: '1',
            name: 'Oil & Filter',
            subtext: 'Use <OEM>',
            price: '$10',
            catalogItemId: null,
          }],
        }],
      },
    })
    expect(html).toContain('A &lt;B&gt; &amp; &quot;C&quot;')
    expect(html).toContain('Cat &lt;script&gt;')
    expect(html).toContain('Oil &amp; Filter')
    expect(html).toContain('Use &lt;OEM&gt;')
    expect(html).not.toContain('Cat <script>')
  })
})

describe('escapeHtml', () => {
  it('escapes markup characters', () => {
    expect(__testOnly.escapeHtml(`<a href="x">O'Brien & Co</a>`)).toBe(
      '&lt;a href=&quot;x&quot;&gt;O&#39;Brien &amp; Co&lt;/a&gt;',
    )
  })
})

describe('sectionsByColumn', () => {
  it('splits left and right sections', () => {
    const { left, right } = __testOnly.sectionsByColumn(defaultServiceLogSheetDocument())
    expect(left.every(s => s.column === 'left')).toBe(true)
    expect(right.every(s => s.column === 'right')).toBe(true)
    expect(left.length).toBeGreaterThan(0)
    expect(right.length).toBeGreaterThan(0)
  })
})
