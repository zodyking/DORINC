import { describe, expect, it } from 'vitest'
import { escapeCsvCell, rowsToCsv } from '../../shared/format/csv'

describe('csv format', () => {
  it('escapes commas and quotes', () => {
    expect(escapeCsvCell('hello')).toBe('hello')
    expect(escapeCsvCell('a,b')).toBe('"a,b"')
    expect(escapeCsvCell('say "hi"')).toBe('"say ""hi"""')
  })

  it('builds csv rows with headers', () => {
    const csv = rowsToCsv([
      { invoiceNumber: 'INV-000001', customer: 'Acme, LLC' },
      { invoiceNumber: 'INV-000002', customer: 'Beta' },
    ])
    expect(csv).toContain('invoiceNumber,customer')
    expect(csv).toContain('"Acme, LLC"')
    expect(csv).toContain('INV-000002,Beta')
  })
})
