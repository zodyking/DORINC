import { describe, expect, it } from 'vitest'
import {
  portalInvoiceOptionLabel,
  portalRequestKindLabel,
  portalRequestMatchesFilter,
  portalRequestStatusPill,
} from '../../app/utils/portal-requests-ui'

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

  it('filters history items', () => {
    const open = { status: 'pending', isOpen: true }
    const resolved = { status: 'approved', isOpen: false }
    expect(portalRequestMatchesFilter(open, 'open')).toBe(true)
    expect(portalRequestMatchesFilter(resolved, 'open')).toBe(false)
    expect(portalRequestMatchesFilter(resolved, 'resolved')).toBe(true)
    expect(portalRequestMatchesFilter(open, 'all')).toBe(true)
  })

  it('formats invoice option labels', () => {
    expect(portalInvoiceOptionLabel('INV-000092', 'Truck #HL-114', '841.88', 'sent'))
      .toBe('INV-000092 — Truck #HL-114 · $841.88 open')
    expect(portalInvoiceOptionLabel('INV-000088', 'Truck #HL-109', '0', 'paid'))
      .toBe('INV-000088 — Truck #HL-109 · Paid')
  })
})
