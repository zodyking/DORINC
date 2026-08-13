import type { BillingSpendPoint } from '../../shared/validators/billing-integrations'

function roundMoney(value: number): number {
  return Math.round(value * 100) / 100
}

function monthKey(date: Date): string {
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`
}

function monthLabel(date: Date): string {
  return date.toLocaleString('en-US', { month: 'short', year: '2-digit', timeZone: 'UTC' })
}

function addUtcMonths(base: Date, offset: number): Date {
  return new Date(Date.UTC(base.getUTCFullYear(), base.getUTCMonth() + offset, 1))
}

export interface BillingOutlookInput {
  vultrPlanMonthly: number
  openrouterMonthly: number
  /** Quo monthly recurring prepaid cost (included every month). */
  quoMonthly?: number
  vultrInvoices: Array<{ date: string, amount: number }>
  openrouterUsage: Array<{ date: string, amount: number }>
  domainRenewals: Array<{ expiresAt: string | null, renewalCost: number | null }>
  now?: Date
}

/**
 * Builds a 12-month spend outlook:
 * - projectedUsd is the expected monthly total for every month (hosting + AI + Quo
 *   run-rate plus any domain renewals falling in that month)
 * - actualUsd is observed charges for past/current months when invoice/usage data exists
 */
export function buildBillingOutlook(input: BillingOutlookInput): BillingSpendPoint[] {
  const now = input.now ?? new Date()
  const current = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1))
  const recurring = roundMoney(
    Math.max(0, input.vultrPlanMonthly)
    + Math.max(0, input.openrouterMonthly)
    + Math.max(0, input.quoMonthly ?? 0),
  )

  const actualByMonth = new Map<string, number>()
  for (const row of [...input.vultrInvoices, ...input.openrouterUsage]) {
    const d = new Date(row.date)
    if (Number.isNaN(d.getTime())) continue
    const key = monthKey(d)
    actualByMonth.set(key, roundMoney((actualByMonth.get(key) ?? 0) + Number(row.amount || 0)))
  }

  const renewalByMonth = new Map<string, number>()
  for (const domain of input.domainRenewals) {
    if (!domain.expiresAt || domain.renewalCost == null || domain.renewalCost <= 0) continue
    const expires = new Date(domain.expiresAt)
    if (Number.isNaN(expires.getTime())) continue
    for (let offset = -5; offset <= 6; offset += 1) {
      const month = addUtcMonths(current, offset)
      if (
        expires.getUTCFullYear() === month.getUTCFullYear()
        && expires.getUTCMonth() === month.getUTCMonth()
      ) {
        const key = monthKey(month)
        renewalByMonth.set(key, roundMoney((renewalByMonth.get(key) ?? 0) + domain.renewalCost))
      }
    }
  }

  const points: BillingSpendPoint[] = []
  for (let offset = -5; offset <= 6; offset += 1) {
    const month = addUtcMonths(current, offset)
    const key = monthKey(month)
    const isFuture = offset > 0
    const projectedBase = roundMoney(recurring + (renewalByMonth.get(key) ?? 0))
    const actual = actualByMonth.has(key) ? actualByMonth.get(key)! : null

    points.push({
      key,
      label: monthLabel(month),
      actualUsd: isFuture ? null : actual,
      // Expected spend for every month so the year chart stays useful end-to-end.
      projectedUsd: projectedBase,
    })
  }

  return points
}
