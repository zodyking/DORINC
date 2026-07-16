import { describe, expect, it } from 'vitest'
import {
  parseServiceLogDraftLineSeeds,
  serviceLogDraftLineToInvoiceSeed,
} from '../../shared/service-log-invoice-lines'

describe('service-log-invoice-lines', () => {
  it('maps draft lines into invoice line seeds', () => {
    expect(serviceLogDraftLineToInvoiceSeed({
      lineType: 'part',
      description: 'Replace Tire',
      qty: '1',
      rate: '325',
      amount: '325',
    }, 0)).toEqual({
      lineType: 'part',
      description: 'Replace Tire',
      quantity: '1',
      unitPrice: '325',
      lineAmount: '325',
      sortOrder: 0,
    })

    expect(serviceLogDraftLineToInvoiceSeed({
      lineType: 'labor',
      description: 'Clean Inside Bus',
      qty: '1',
      rate: '55',
      amount: '55',
    }, 1)).toEqual({
      lineType: 'labor',
      description: 'Clean Inside Bus',
      quantity: '1',
      unitPrice: '55',
      lineAmount: '55',
      sortOrder: 1,
    })
  })

  it('uses amount as unit price when rate is missing', () => {
    expect(serviceLogDraftLineToInvoiceSeed({
      description: 'Shop supplies',
      qty: '1',
      amount: '12.50',
    }, 0)).toEqual({
      lineType: 'labor',
      description: 'Shop supplies',
      quantity: '1',
      unitPrice: '12.50',
      lineAmount: '12.50',
      sortOrder: 0,
    })
  })

  it('skips blank descriptions and ignores invalid arrays', () => {
    expect(parseServiceLogDraftLineSeeds(null)).toEqual([])
    expect(parseServiceLogDraftLineSeeds([{ description: '   ' }])).toEqual([])
    expect(parseServiceLogDraftLineSeeds([
      { lineType: 'part', description: 'Filter', qty: '1', rate: '20', amount: '20' },
      { lineType: 'fee', description: 'Disposal', qty: '1', rate: '5', amount: '5' },
    ])).toHaveLength(2)
  })
})
