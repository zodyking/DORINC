// Dashboard presentation helpers (mockup: PAGE: DASHBOARD / P1-37).

import { moneyDisplay } from './invoices-ui'

export type DashboardView = 'billing' | 'mechanic'

export function dashboardKpiDeltaClass(delta: string | null | undefined): 'up' | 'down' | 'flat' {
  if (!delta) return 'flat'
  if (delta.startsWith('▲')) return 'up'
  if (delta.startsWith('▼')) return 'down'
  return 'flat'
}

export function dashboardOutstandingSub(count: number): string {
  return `${count} open invoice${count === 1 ? '' : 's'}`
}

export function dashboardOverdueSub(count: number): string {
  if (!count) return '—'
  return `${count} invoice${count === 1 ? '' : 's'} past net-30`
}

export function dashboardAvgDaysDisplay(days: number | null | undefined): string {
  if (days == null) return '—'
  return String(days)
}

export function dashboardMechanicFleetSub(vehicles: number, customers: number): string {
  return `Across ${customers} customer${customers === 1 ? '' : 's'}`
}

export function dashboardInvoiceStatusPill(status: string): { cls: string, label: string } {
  switch (status) {
    case 'overdue': return { cls: 'pill over', label: 'Overdue' }
    case 'draft': return { cls: 'pill draft', label: 'Draft' }
    case 'sent': return { cls: 'pill sent', label: 'Sent' }
    case 'paid': return { cls: 'pill paid', label: 'Paid' }
    default: return { cls: 'pill gray', label: status }
  }
}

export function dashboardMoney(value: string | null | undefined): string {
  return moneyDisplay(value)
}

export function dashboardActivityWhen(iso: string): string {
  const d = new Date(iso)
  const now = new Date()
  const sameDay = d.toDateString() === now.toDateString()
  if (sameDay) {
    return `Today ${d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}`
  }
  return d.toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })
}
