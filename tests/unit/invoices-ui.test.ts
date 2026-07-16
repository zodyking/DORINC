import { describe, expect, it } from 'vitest'
import {
  invoiceDateDisplay,
  invoiceStatusPill,
  isInvoiceOverdue,
  lineQuantityDisplay,
  moneyDisplay,
  paymentTermsLabel,
  vehicleSnapshotSub,
} from '../../app/utils/invoices-ui'

describe('invoices-ui helpers (P1-22)', () => {
  it('formats money from API strings', () => {
    expect(moneyDisplay('2418.32')).toBe('$2,418.32')
    expect(moneyDisplay('0')).toBe('$0.00')
    expect(moneyDisplay(null)).toBe('—')
  })

  it('labels payment terms like the mockup', () => {
    expect(paymentTermsLabel('net_30')).toBe('Net 30')
    expect(paymentTermsLabel('due_on_receipt')).toBe('Due on receipt')
  })

  it('derives overdue pill from sent + past due + balance', () => {
    expect(isInvoiceOverdue('sent', '2026-06-01', '100.00')).toBe(true)
    expect(isInvoiceOverdue('paid', '2026-06-01', '100.00')).toBe(false)
    expect(isInvoiceOverdue('sent', '2099-01-01', '100.00')).toBe(false)
    const pill = invoiceStatusPill('sent', '2026-06-01', '100.00')
    expect(pill.cls).toBe('pill over')
    expect(pill.label).toBe('Overdue')
  })

  it('formats dates and labor quantities', () => {
    expect(invoiceDateDisplay('2026-07-03')).toMatch(/Jul/)
    expect(lineQuantityDisplay('2', 'labor')).toBe('2.0 hr')
    expect(lineQuantityDisplay('1', 'fee')).toBe('—')
  })

  it('shows fleet unit label when bus number is on the snapshot', () => {
    expect(vehicleSnapshotSub({
      unitType: 'bus',
      busNumber: '616',
      unitTag: null,
      year: 2023,
      make: 'IC BUS',
      model: 'PB105',
      vin: '4DRBUC8N2PB781791',
    })).toBe('Bus #616')
  })

  it('falls back to year/make/model and VIN without a fleet number', () => {
    expect(vehicleSnapshotSub({
      unitType: 'truck',
      busNumber: null,
      unitTag: null,
      year: 2019,
      make: 'Freightliner',
      model: 'Cascadia',
      vin: '1FVXXXX',
    })).toBe('2019 Freightliner Cascadia · 1FVXXXX')
  })
})
