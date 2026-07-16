import { describe, expect, it } from 'vitest'
import {
  portalInvoiceOptionLabel,
  portalRequestApplyListFilters,
  portalRequestDefaultListFilters,
  portalRequestKindLabel,
  portalRequestListFiltersDirty,
  portalRequestMatchesFilter,
  portalRequestMatchesKindFilter,
  portalRequestStatusPill,
  type PortalRequestListRow,
} from '../../app/utils/portal-requests-ui'

const sampleRows: PortalRequestListRow[] = [
  {
    id: '1',
    kind: 'service',
    title: 'Bus #616 — Preventive maintenance',
    meta: 'Jul 16, 2026 · normal',
    status: 'pending',
    statusLabel: 'Under review',
    createdAt: '2026-07-16T12:00:00.000Z',
    isOpen: true,
    vehicleId: 'veh-1',
    vehicleLabel: 'Bus #616',
    invoiceId: null,
    invoiceNumberFormatted: null,
  },
  {
    id: '2',
    kind: 'billing',
    title: 'INV-000104 — Payment or balance question',
    meta: 'Jul 15, 2026',
    status: 'approved',
    statusLabel: 'Resolved',
    createdAt: '2026-07-15T12:00:00.000Z',
    isOpen: false,
    vehicleId: 'veh-1',
    vehicleLabel: 'Bus #616',
    invoiceId: 'inv-1',
    invoiceNumberFormatted: 'INV-000104',
  },
  {
    id: '3',
    kind: 'general',
    title: 'hello',
    meta: 'Jul 14, 2026',
    status: 'pending',
    statusLabel: 'Under review',
    createdAt: '2026-07-14T12:00:00.000Z',
    isOpen: true,
    vehicleId: null,
    vehicleLabel: null,
    invoiceId: null,
    invoiceNumberFormatted: null,
  },
]

describe('portal-requests-ui helpers (P2-07)', () => {
  it('labels request kinds', () => {
    expect(portalRequestKindLabel('service')).toBe('Service')
    expect(portalRequestKindLabel('billing')).toBe('Billing')
    expect(portalRequestKindLabel('vehicle_change')).toBe('Vehicle')
    expect(portalRequestKindLabel('general')).toBe('General')
  })

  it('maps request status pills', () => {
    expect(portalRequestStatusPill('pending')).toEqual({ cls: 'pill warn', label: 'Under review' })
    expect(portalRequestStatusPill('approved')).toEqual({ cls: 'pill ok', label: 'Resolved' })
  })

  it('filters history items by open/resolved', () => {
    const open = { status: 'pending', isOpen: true }
    const resolved = { status: 'approved', isOpen: false }
    expect(portalRequestMatchesFilter(open, 'open')).toBe(true)
    expect(portalRequestMatchesFilter(resolved, 'open')).toBe(false)
    expect(portalRequestMatchesFilter(resolved, 'resolved')).toBe(true)
    expect(portalRequestMatchesFilter(open, 'all')).toBe(true)
  })

  it('filters by kind and vehicle', () => {
    expect(portalRequestMatchesKindFilter('vehicle_change', 'vehicle')).toBe(true)
    expect(portalRequestMatchesKindFilter('billing', 'vehicle')).toBe(false)
    const filters = { ...portalRequestDefaultListFilters(), status: 'all' as const, kind: 'billing' as const, vehicleId: 'veh-1' }
    const rows = portalRequestApplyListFilters(sampleRows, filters)
    expect(rows).toHaveLength(1)
    expect(rows[0]?.invoiceNumberFormatted).toBe('INV-000104')
  })

  it('searches requests and detects dirty filters', () => {
    const filters = { ...portalRequestDefaultListFilters(), status: 'all' as const, q: 'INV-000104' }
    expect(portalRequestApplyListFilters(sampleRows, filters)).toHaveLength(1)
    expect(portalRequestListFiltersDirty(filters)).toBe(true)
    expect(portalRequestListFiltersDirty(portalRequestDefaultListFilters())).toBe(false)
  })

  it('formats invoice option labels', () => {
    expect(portalInvoiceOptionLabel('INV-000092', 'Truck #HL-114', '841.88', 'sent'))
      .toBe('INV-000092 — Truck #HL-114 · $841.88 open')
    expect(portalInvoiceOptionLabel('INV-000088', 'Truck #HL-109', '0', 'paid'))
      .toBe('INV-000088 — Truck #HL-109 · Paid')
  })
})
