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
  vultrInvoices: Array<{ date: string, amount: number }>
  openrouterUsage: Array<{ date: string, amount: number }>
  domainRenewals: Array<{ expiresAt: string | null, renewalCost: number | null }>
  now?: Date
}

/**
 * Builds a 12-month spend outlook: 6 past months of observed charges +
 * current/future months projected from recurring plan/AI spend and domain renewals.
 */
export function buildBillingOutlook(input: BillingOutlookInput): BillingSpendPoint[] {
  const now = input.now ?? new Date()
  const current = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1))
  const recurring = roundMoney(Math.max(0, input.vultrPlanMonthly) + Math.max(0, input.openrouterMonthly))

  const actualByMonth = new Map<string, number>()
  for (const row of [...input.vultrInvoices, ...input.openrouterUsage]) {
    const d = new Date(row.date)
    if (Number.isNaN(d.getTime())) continue
    const key = monthKey(d)
    actualByMonth.set(key, roundMoney((actualByMonth.get(key) ?? 0) + Number(row.amount || 0)))
  }

  const renewalByMonth = new Map<string, number>()
  for (const domain of input.domainRenewals) {
    if (!domain.expiresAt || domain.renewalCost == null) continue
    const expires = new Date(domain.expiresAt)
    if (Number.isNaN(expires.getTime())) continue
    // Attribute renewal to the month it falls due (current year window).
    for (let offset = 0; offset < 6; offset += 1) {
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
    const isCurrent = offset === 0
    const actual = actualByMonth.has(key) ? actualByMonth.get(key)! : null
    const projectedBase = recurring + (renewalByMonth.get(key) ?? 0)

    points.push({
      key,
      label: monthLabel(month),
      actualUsd: isFuture ? null : actual,
      projectedUsd: isFuture || isCurrent ? projectedBase : null,
    })
  }

  return points
}
