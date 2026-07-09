import { describe, expect, it } from 'vitest'
import {
  dashboardInvoiceStatusPill,
  dashboardKpiDeltaClass,
  dashboardMechanicFleetSub,
  dashboardOutstandingSub,
} from '../../app/utils/dashboard-ui'

describe('dashboard-ui helpers (P1-37)', () => {
  it('classifies KPI delta direction', () => {
    expect(dashboardKpiDeltaClass('▲ 12.4% vs June')).toBe('up')
    expect(dashboardKpiDeltaClass('▼ 3.1% vs May')).toBe('down')
    expect(dashboardKpiDeltaClass(null)).toBe('flat')
  })

  it('labels outstanding and fleet subtext', () => {
    expect(dashboardOutstandingSub(1)).toBe('1 open invoice')
    expect(dashboardOutstandingSub(11)).toBe('11 open invoices')
    expect(dashboardMechanicFleetSub(41, 18)).toBe('Across 18 customers')
  })

  it('maps invoice status pills', () => {
    expect(dashboardInvoiceStatusPill('overdue').cls).toBe('pill over')
    expect(dashboardInvoiceStatusPill('draft').label).toBe('Draft')
  })
})
