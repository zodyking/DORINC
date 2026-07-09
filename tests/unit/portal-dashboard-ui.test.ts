import { describe, expect, it } from 'vitest'
import {
  portalInvoiceStatus,
  portalOpenBalanceSub,
  portalUserInitials,
} from '../../app/utils/portal-dashboard-ui'

describe('portal-dashboard-ui helpers (P2-04)', () => {
  it('formats open balance subtext', () => {
    expect(portalOpenBalanceSub(1)).toBe('1 unpaid invoice')
    expect(portalOpenBalanceSub(2)).toBe('2 unpaid invoices')
  })

  it('derives user initials', () => {
    expect(portalUserInitials('Marcus Hollis')).toBe('MH')
    expect(portalUserInitials('Gary')).toBe('GA')
  })

  it('maps sent invoices to awaiting payment pill', () => {
    expect(portalInvoiceStatus('sent', '2026-08-02', '841.88')).toEqual({
      cls: 'pill info',
      label: 'Awaiting payment',
    })
    expect(portalInvoiceStatus('paid', null, '0')).toEqual({
      cls: 'pill paid',
      label: 'Paid',
    })
  })
})
