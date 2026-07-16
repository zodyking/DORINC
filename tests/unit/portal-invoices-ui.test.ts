import { describe, expect, it } from 'vitest'
import {
  portalInvoiceApplyListFilters,
  portalInvoiceDefaultListFilters,
  portalInvoiceDetailStatus,
  portalInvoiceIsOpen,
  portalInvoiceLineCorrectionFormFromLine,
  portalInvoiceLineCorrectionHasChanges,
  portalInvoiceMatchesFilter,
  type PortalInvoiceListRow,
} from '../../app/utils/portal-invoices-ui'

const rows: PortalInvoiceListRow[] = [
  {
    id: '1',
    invoiceNumberFormatted: 'INV-000101',
    status: 'sent',
    invoiceDate: '2026-07-01',
    dueDate: '2026-07-15',
    total: '500.00',
    balanceDue: '500.00',
    vehicleId: 'veh-a',
    vehicleLabel: 'Bus #616',
  },
  {
    id: '2',
    invoiceNumberFormatted: 'INV-000102',
    status: 'paid',
    invoiceDate: '2026-06-01',
    dueDate: null,
    total: '200.00',
    balanceDue: '0',
    vehicleId: 'veh-b',
    vehicleLabel: 'Truck #12',
  },
]

describe('portal-invoices-ui helpers (P2-05)', () => {
  it('detects open invoices', () => {
    expect(portalInvoiceIsOpen('sent', '841.88')).toBe(true)
    expect(portalInvoiceIsOpen('paid', '0')).toBe(false)
  })

  it('filters invoice list chips', () => {
    expect(portalInvoiceMatchesFilter('sent', '100', 'open')).toBe(true)
    expect(portalInvoiceMatchesFilter('paid', '0', 'open')).toBe(false)
    expect(portalInvoiceMatchesFilter('paid', '0', 'paid')).toBe(true)
    expect(portalInvoiceMatchesFilter('sent', '100', 'all')).toBe(true)
  })

  it('formats detail status pill for open balance', () => {
    expect(portalInvoiceDetailStatus('sent', '2026-08-02', '841.88')).toEqual({
      cls: 'pill info',
      label: 'Open · $841.88 due',
    })
  })

  it('filters by vehicle, date range, and amount', () => {
    const filters = {
      ...portalInvoiceDefaultListFilters(),
      vehicleId: 'veh-a',
      dateFrom: '2026-07-01',
      dateTo: '2026-07-31',
      amountMin: '400',
    }
    expect(portalInvoiceApplyListFilters(rows, filters).map(r => r.id)).toEqual(['1'])
  })

  it('sorts by vehicle label', () => {
    const filters = { ...portalInvoiceDefaultListFilters(), sort: 'vehicle' as const }
    expect(portalInvoiceApplyListFilters(rows, filters).map(r => r.vehicleLabel)).toEqual([
      'Bus #616',
      'Truck #12',
    ])
  })

  it('builds line correction form and detects changes', () => {
    const line = { description: 'Oil change', quantity: '1.00', unitPrice: '85.00' }
    expect(portalInvoiceLineCorrectionFormFromLine(line)).toEqual({
      description: 'Oil change',
      quantity: '1.00',
      unitPrice: '85.00',
      notes: '',
    })
    expect(portalInvoiceLineCorrectionHasChanges(line, { ...line })).toBe(false)
    expect(portalInvoiceLineCorrectionHasChanges(line, { ...line, quantity: '0.50' })).toBe(true)
  })
})
