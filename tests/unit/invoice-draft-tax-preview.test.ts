import { describe, expect, it } from 'vitest'
import { previewDraftTotals, createEmptyLine } from '../../app/utils/invoice-creator-ui'

describe('previewDraftTotals tax preview', () => {
  it('includes tax in estimated total before save', () => {
    const line = createEmptyLine()
    line.description = 'Labor'
    line.quantity = '1'
    line.unitPrice = '100.00'
    const totals = previewDraftTotals([line], {
      taxExempt: false,
      taxRate: '0.066000',
    })
    expect(totals.taxAmount).toBe('6.60')
    expect(totals.total).toBe('106.60')
  })

  it('respects tax exempt flag in preview', () => {
    const line = createEmptyLine()
    line.description = 'Labor'
    line.quantity = '1'
    line.unitPrice = '100.00'
    const totals = previewDraftTotals([line], {
      taxExempt: true,
      taxRate: '0.066000',
    })
    expect(totals.taxAmount).toBe('0')
    expect(totals.total).toBe('100.00')
  })
})
