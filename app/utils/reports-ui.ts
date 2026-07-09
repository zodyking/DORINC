import { moneyDisplay } from './invoices-ui'

export type ReportTab = 'revenue' | 'aging' | 'productivity'

export function reportTabLabel(tab: ReportTab): string {
  switch (tab) {
    case 'revenue': return 'Revenue'
    case 'aging': return 'A/R Aging'
    case 'productivity': return 'Mechanic productivity'
  }
}

export function reportMoney(value: string | null | undefined): string {
  return moneyDisplay(value)
}

export function reportPeriodLabel(period: string): string {
  const [year, month] = period.split('-')
  const d = new Date(Number(year), Number(month) - 1, 1)
  return d.toLocaleDateString(undefined, { month: 'short', year: 'numeric' })
}

export function reportPercent(value: number | null | undefined): string {
  if (value == null) return '—'
  return `${value.toFixed(1)}%`
}

export function agingBucketTone(key: string): string {
  switch (key) {
    case 'current': return 'ok'
    case '1_30': return 'info'
    case '31_60': return 'warn'
    case '61_90': return 'over'
    default: return 'bad'
  }
}

export function defaultReportFromDate(): string {
  const d = new Date()
  d.setMonth(d.getMonth() - 11)
  d.setDate(1)
  return d.toISOString().slice(0, 10)
}

export function defaultReportToDate(): string {
  return new Date().toISOString().slice(0, 10)
}
