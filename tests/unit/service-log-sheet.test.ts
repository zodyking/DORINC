import { describe, expect, it } from 'vitest'
import { serviceLogSheetSettingsSchema } from '../../shared/validators/workspace-settings'
import { DEFAULT_SERVICE_LOG_SHEET_SETTINGS } from '../../shared/workspace-settings-defaults'
import {
  formatSheetPrice,
  renderServiceLogSheetHtml,
  splitCategoriesIntoColumns,
  type ServiceLogSheetPayload,
  __testOnly,
} from '../../server/services/service-log-sheet.service'
import { formatSheetPriceDisplay } from '../../app/utils/service-log-sheet-display'

describe('service log sheet settings', () => {
  it('defaults to all catalog items', () => {
    const parsed = serviceLogSheetSettingsSchema.parse({})
    expect(parsed).toEqual(DEFAULT_SERVICE_LOG_SHEET_SETTINGS)
    expect(parsed.mode).toBe('all')
  })

  it('accepts selected item ids', () => {
    const id = '11111111-1111-4111-8111-111111111111'
    const parsed = serviceLogSheetSettingsSchema.parse({
      mode: 'selected',
      itemIds: [id],
    })
    expect(parsed.mode).toBe('selected')
    expect(parsed.itemIds).toEqual([id])
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

describe('splitCategoriesIntoColumns', () => {
  it('balances categories by item count', () => {
    const categories = [
      { id: 'a', name: 'A', sortOrder: 0, items: [{ id: '1', name: 'One', description: null, priceLabel: '$1', itemType: 'labor' }] },
      { id: 'b', name: 'B', sortOrder: 1, items: [
        { id: '2', name: 'Two', description: null, priceLabel: '$2', itemType: 'labor' },
        { id: '3', name: 'Three', description: null, priceLabel: '$3', itemType: 'labor' },
        { id: '4', name: 'Four', description: null, priceLabel: '$4', itemType: 'labor' },
      ] },
      { id: 'c', name: 'C', sortOrder: 2, items: [{ id: '5', name: 'Five', description: null, priceLabel: '$5', itemType: 'labor' }] },
    ]
    const [left, right] = splitCategoriesIntoColumns(categories)
    expect(left.length + right.length).toBe(3)
    const leftCount = left.reduce((n, c) => n + c.items.length, 0)
    const rightCount = right.reduce((n, c) => n + c.items.length, 0)
    expect(Math.abs(leftCount - rightCount)).toBeLessThanOrEqual(2)
  })
})

describe('renderServiceLogSheetHtml', () => {
  const basePayload: ServiceLogSheetPayload = {
    settings: { mode: 'selected', itemIds: ['1'] },
    business: {
      businessName: 'Devon Onsite Repairs INC',
      phone: '(646) 731-7021',
      email: 'accounting@devononsiterepairs.com',
      addressLine: '387 Van Siclen Ave, Brooklyn, NY 11207',
    },
    catalogItems: [],
    categories: [
      {
        id: 'cat-1',
        name: 'Cleaning',
        sortOrder: 0,
        items: [
          {
            id: '1',
            name: 'Steam Clean Engine',
            description: null,
            priceLabel: '$35',
            itemType: 'labor',
          },
        ],
      },
    ],
    includedCount: 1,
    totalCatalogCount: 1,
  }

  it('renders company header and service rows', () => {
    const html = renderServiceLogSheetHtml(basePayload)
    expect(html).toContain('Devon Onsite Repairs INC')
    expect(html).toContain('Steam Clean Engine')
    expect(html).toContain('$35')
    expect(html).toContain('Customer Complaint or Vehicle Symptoms')
    expect(html).toContain('autoprint')
  })

  it('escapes HTML in names', () => {
    const html = renderServiceLogSheetHtml({
      ...basePayload,
      business: { ...basePayload.business, businessName: 'A <B> & "C"' },
      categories: [{
        id: 'x',
        name: 'Cat <script>',
        sortOrder: 0,
        items: [{
          id: '1',
          name: 'Oil & Filter',
          description: 'Use <OEM>',
          priceLabel: '$10',
          itemType: 'part',
        }],
      }],
    })
    expect(html).toContain('A &lt;B&gt; &amp; &quot;C&quot;')
    expect(html).toContain('Cat &lt;script&gt;')
    expect(html).toContain('Oil &amp; Filter')
    expect(html).toContain('Use &lt;OEM&gt;')
    expect(html).not.toContain('Cat <script>')
  })

  it('shows empty state when no items included', () => {
    const html = renderServiceLogSheetHtml({
      ...basePayload,
      categories: [],
      includedCount: 0,
    })
    expect(html).toContain('No catalog items are included')
  })
})

describe('escapeHtml', () => {
  it('escapes markup characters', () => {
    expect(__testOnly.escapeHtml(`<a href="x">O'Brien & Co</a>`)).toBe(
      '&lt;a href=&quot;x&quot;&gt;O&#39;Brien &amp; Co&lt;/a&gt;',
    )
  })
})
