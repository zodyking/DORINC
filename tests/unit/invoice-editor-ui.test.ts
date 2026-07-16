import { describe, expect, it } from 'vitest'
import {
  applyCatalogItemToLineFields,
  autosavedLabel,
  catalogItemSub,
  catalogTypeToLineType,
  editorSummaryRows,
  formatHistoryChange,
} from '../../app/utils/invoice-editor-ui'

describe('invoice-editor-ui helpers (P1-24)', () => {
  it('formats autosave labels like the mockup', () => {
    const now = Date.parse('2026-07-08T12:00:20Z')
    const saved = new Date('2026-07-08T12:00:08Z')
    expect(autosavedLabel(saved, now)).toBe('autosaved 12 seconds ago')
    expect(autosavedLabel(new Date('2026-07-08T12:00:19Z'), now)).toBe('autosaved just now')
    expect(autosavedLabel(null, now)).toBe('Not saved yet')
  })

  it('maps catalog types to invoice line types', () => {
    expect(catalogTypeToLineType('part')).toBe('part')
    expect(catalogTypeToLineType('fee')).toBe('fee')
    expect(catalogTypeToLineType('labor')).toBe('labor')
    expect(catalogTypeToLineType('service')).toBe('labor')
    expect(catalogTypeToLineType('unknown')).toBe('labor')
  })

  it('applies catalog picks onto line fields', () => {
    expect(applyCatalogItemToLineFields({
      id: 'cat-1',
      itemType: 'labor',
      sku: null,
      name: 'Diesel tech labor',
      defaultPrice: '145.00',
      uom: 'hr',
    })).toEqual({
      lineType: 'labor',
      description: 'Diesel tech labor',
      quantity: '1',
      unitPrice: '145.00',
      catalogItemId: 'cat-1',
    })
    expect(applyCatalogItemToLineFields({
      id: 'cat-2',
      itemType: 'part',
      sku: 'P-1',
      name: 'Filter',
      defaultPrice: null,
      uom: 'each',
    }).unitPrice).toBe('0')
  })

  it('renders catalog quick-add subtitles', () => {
    expect(catalogItemSub({
      id: '1',
      itemType: 'labor',
      sku: null,
      name: 'Labor — Diesel tech',
      defaultPrice: '145.00',
      uom: 'hr',
    })).toContain('$145.00')
    expect(catalogItemSub({
      id: '2',
      itemType: 'part',
      sku: 'PART-0114',
      name: 'Oil',
      defaultPrice: '18.40',
      uom: 'each',
    })).toContain('PART-0114')
  })

  it('builds summary rows from server totals only', () => {
    const rows = editorSummaryRows({
      subtotal: '920.18',
      taxAmount: '0',
      taxExempt: true,
      feesAmount: '32.21',
      shopSuppliesPercent: '3.5',
      discountAmount: '0',
      total: '952.39',
    })
    expect(rows[0]?.value).toBe('$920.18')
    expect(rows.find(r => r.grand)?.value).toBe('$952.39')
  })

  it('uses breakdown sum for subtotal and total when fee lines are not yet in server subtotal', () => {
    const rows = editorSummaryRows({
      subtotal: '460.00',
      taxAmount: '0',
      taxExempt: true,
      feesAmount: '0',
      shopSuppliesPercent: null,
      discountAmount: '0',
      total: '460.00',
    }, {
      breakdown: { parts: '325.00', labor: '135.00', fees: '100.00' },
    })
    expect(rows.find(r => r.label === 'Subtotal')?.value).toBe('$560.00')
    expect(rows.find(r => r.grand)?.value).toBe('$560.00')
  })

  it('includes parts, labor, and fees before subtotal when breakdown is provided', () => {
    const rows = editorSummaryRows({
      subtotal: '360.00',
      taxAmount: '0',
      taxExempt: false,
      feesAmount: '0',
      shopSuppliesPercent: null,
      discountAmount: '0',
      total: '360.00',
    }, {
      breakdown: { parts: '0.00', labor: '360.00', fees: '0.00' },
      grandLabel: 'Estimated total',
    })
    expect(rows.map(r => r.label)).toEqual([
      'Parts',
      'Labor',
      'Fees',
      'Subtotal',
      'Tax',
      'Estimated total',
    ])
    expect(rows.find(r => r.label === 'Labor')?.value).toBe('$360.00')
  })

  it('formats audit history rows', () => {
    expect(formatHistoryChange('invoices.line_items.create', { description: 'NOx sensor' }))
      .toBe('Added line · NOx sensor')
  })
})
