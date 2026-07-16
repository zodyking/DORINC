import { describe, expect, it } from 'vitest'
import { buildPortalLineItemCorrectionDescription } from '../../shared/portal-line-correction'

describe('portal line item correction description', () => {
  it('formats current and proposed values', () => {
    const text = buildPortalLineItemCorrectionDescription('INV-000105', {
      lineItemId: 'line-1',
      original: {
        description: 'Repair Exhaust Leak',
        quantity: '1.00',
        unitPrice: '650.00',
      },
      proposed: {
        description: 'Repair Exhaust Leak',
        quantity: '0.50',
        unitPrice: '650.00',
      },
      notes: 'Labor should be half hour',
    })

    expect(text).toContain('Invoice: INV-000105')
    expect(text).toContain('Current:')
    expect(text).toContain('Qty/Hours: 1.00')
    expect(text).toContain('Requested:')
    expect(text).toContain('Qty/Hours: 0.50')
    expect(text).toContain('Labor should be half hour')
  })
})
