import { describe, expect, it } from 'vitest'
import {
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
    expect(catalogTypeToLineType('labor')).toBe('labor')
    expect(catalogTypeToLineType('unknown')).toBe('service')
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

  it('formats audit history rows', () => {
    expect(formatHistoryChange('invoices.line_items.create', { description: 'NOx sensor' }))
      .toBe('Added line · NOx sensor')
  })
})
