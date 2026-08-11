import { describe, expect, it } from 'vitest'
import {
  extractInvoiceNumber,
  extractServiceLogNumber,
  inferInvoiceStatus,
  parseInvoiceLookupStatus,
  stripInvoiceNumberLabel,
  stripServiceLogNumberLabel,
} from '../../shared/susan-entity-query'
import { parseInvoiceLookupArgs } from '../../shared/ai-tools'

describe('susan entity query helpers', () => {
  it('extracts INV-000713 as 713', () => {
    expect(extractInvoiceNumber('INV-000713')).toBe(713)
    expect(extractInvoiceNumber('inv 713')).toBe(713)
    expect(extractInvoiceNumber('whats the total of INV-000713')).toBe(713)
    expect(extractInvoiceNumber('713')).toBe(713)
    expect(extractInvoiceNumber('Acme Transit')).toBeNull()
  })

  it('extracts SL numbers', () => {
    expect(extractServiceLogNumber('SL-0713')).toBe(713)
    expect(extractServiceLogNumber('sl-42')).toBe(42)
    expect(extractServiceLogNumber('status of SL-0009 please')).toBe(9)
  })

  it('strips labels for ILIKE', () => {
    expect(stripInvoiceNumberLabel('INV-000713')).toBe('713')
    expect(stripServiceLogNumberLabel('SL-0713')).toBe('713')
  })

  it('infers unpaid/overdue/stats status phrases', () => {
    expect(inferInvoiceStatus('unpaid invoices')).toBe('unpaid')
    expect(inferInvoiceStatus('how manny invoices are unpaid')).toBe('unpaid')
    expect(inferInvoiceStatus('how many overdue invoices')).toBe('overdue')
    expect(inferInvoiceStatus('invoice stats')).toBe('stats')
    expect(inferInvoiceStatus('INV-000713')).toBeNull()
  })

  it('parses lookup args status', () => {
    expect(parseInvoiceLookupStatus('open')).toBe('unpaid')
    expect(parseInvoiceLookupArgs({ query: 'INV-000713', status: 'unpaid' })).toMatchObject({
      query: 'INV-000713',
      status: 'unpaid',
    })
  })
})
