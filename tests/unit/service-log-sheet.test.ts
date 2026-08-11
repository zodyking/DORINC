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

  it('places Bus/Unit after Customer Name and sizes it like the date fields', () => {
    const html = renderServiceLogSheetHtml(payload, { forPdf: true })
    const topStart = html.indexOf('<table class="top-fields">')
    const topEnd = html.indexOf('<div class="complaint-field">', topStart)
    expect(topStart).toBeGreaterThan(-1)
    expect(topEnd).toBeGreaterThan(topStart)
    const top = html.slice(topStart, topEnd)
    const customerAt = top.indexOf('f-customer')
    const unitAt = top.indexOf('f-unit')
    const invoiceAt = top.indexOf('f-invoice-date')
    const dueAt = top.indexOf('f-due-date')
    expect(customerAt).toBeGreaterThan(-1)
    expect(unitAt).toBeGreaterThan(customerAt)
    expect(invoiceAt).toBeGreaterThan(unitAt)
    expect(dueAt).toBeGreaterThan(invoiceAt)
    expect(html).toContain('.sheet-doc .top-fields td.f-customer { width: 49%; }')
    expect(html).toContain('.sheet-doc .top-fields td.f-unit { width: 17%; }')
    expect(html).toContain('.sheet-doc .top-fields td.f-invoice-date { width: 17%; }')
    expect(html).toContain('.sheet-doc .top-fields td.f-due-date { width: 17%;')
  })

  it('renders Letter two-column template content', () => {
    const html = renderServiceLogSheetHtml(payload, {
      forPdf: true,
      uploadQrDataUrl: 'data:image/png;base64,qrtest',
    })
    expect(html).toContain('Devon Onsite Repairs INC')
    expect(html).toContain('Service Log Sheet')
    expect(html).not.toContain('Service Catalog')
    expect(html).toContain('Steam Clean Engine')
    expect(html).toContain('Replace Heavy Duty Battery')
    expect(html).toContain('1000 cranking amps')
    expect(html).toContain('Inspection Service')
    expect(html).toContain('$3,750')
    expect(html).toContain('catalog-grid')
    expect(html).toContain('Customer Complaint or Vehicle Symptoms')
    expect(html).toContain('<table class="catalog-grid">')
    expect(html).toContain('price-cell')
    expect(html).toContain('new-price-cell')
    expect(html).not.toContain('price-entry')
    expect(html).toContain('page-back')
    expect(html).toContain('Service Description')
    expect(html).toContain('Quantity')
    expect(html).toContain('blank-work-table')
    expect(html).not.toContain('Customer Signature')
    expect(html).not.toContain('sign-row')
    // QR is seated inside the catalog grid (right-column void), not after it.
    expect(html).toContain('sheet-upload-qr-cell')
    expect(html).toContain('Scan to Upload')
    expect(html).toContain('alerts the team an invoice needs to be made')
    expect(html).toContain('data:image/png;base64,qrtest')
    expect(html).toContain('rowspan=')
    const catalogClose = html.indexOf('</table>', html.indexOf('catalog-grid'))
    const qrAt = html.indexOf('sheet-upload-qr-cell')
    expect(qrAt).toBeGreaterThan(-1)
    expect(qrAt).toBeLessThan(catalogClose)
    // DomPDF uses default_media_type=screen — screen chrome must never ship in PDF HTML.
    expect(html).not.toMatch(/@media\s+screen/)
    expect(html).not.toContain('width: 8.5in')
    expect(html).not.toContain('<main')
    expect(html).not.toContain('<section')
  })

  it('keeps the catalog on DomPDF-safe foundations', () => {
    const html = renderServiceLogSheetHtml(payload, { forPdf: true })
    // DomPDF never reads <col> widths, and it only records a width from a cell
    // whose colspan is 1 — widths therefore live on the cells.
    expect(html).not.toContain('<colgroup')
    expect(html).not.toContain('<col ')
    expect(html).not.toMatch(/table-layout:\s*fixed/)
    // @page margins are stored on the root html frame, so any html margin reset
    // deletes every page margin and the sheet bleeds off the paper.
    expect(html).not.toMatch(/html\s*,?\s*(body)?\s*\{[^}]*margin/)
    // One flat table with a repeating head: DomPDF cannot split a table that
    // contains nested tables, so a nested grid blanks page 1 when it overflows.
    const gridStart = html.indexOf('<table class="catalog-grid">')
    const gridOpenEnd = gridStart + '<table class="catalog-grid">'.length
    const grid = html.slice(gridOpenEnd, html.indexOf('</table>', gridOpenEnd))
    expect(grid).not.toContain('<table')
    expect(html).toContain('<thead>')
  })

  it('zips both columns into one row per printed line', () => {
    const html = renderServiceLogSheetHtml(payload, { forPdf: true })
    const rows = html.match(/<tr>/g)?.length ?? 0
    const doc = defaultServiceLogSheetDocument()
    const rowsFor = (column: 'left' | 'right') => doc.sections
      .filter(section => section.column === column)
      .reduce((total, section) => total + section.items.length + 1, 0)
    // Front grid rows (max of both columns) + head row + back page rows.
    expect(rows).toBeGreaterThanOrEqual(Math.max(rowsFor('left'), rowsFor('right')))
    expect(html).toContain('grid-gap')
    expect(html).toContain('void-cell')
    expect(html).toContain('group-end')
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
