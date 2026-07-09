import { describe, expect, it } from 'vitest'
import {
  portalInvoiceDetailStatus,
  portalInvoiceIsOpen,
  portalInvoiceMatchesFilter,
} from '../../app/utils/portal-invoices-ui'

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
})
