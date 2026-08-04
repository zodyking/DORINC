import type { BillingDashboardDomain, NamecheapManualDomain } from '../../shared/validators/billing-integrations'

function daysUntil(date: Date): number {
  const ms = date.getTime() - Date.now()
  return Math.ceil(ms / (24 * 60 * 60 * 1000))
}

export function mapManualNamecheapDomains(manual: NamecheapManualDomain[]): BillingDashboardDomain[] {
  return manual.map((row) => {
    const expiry = new Date(`${row.renewalDate}T00:00:00.000Z`)
    const days = Number.isNaN(expiry.getTime()) ? 0 : daysUntil(expiry)
    return {
      name: row.name,
      renewalDate: row.renewalDate,
      daysUntilRenewal: days,
      autoRenew: false,
      premium: false,
      renewalCost: row.renewalCost,
      renewalCostStatus: 'ok',
      currency: 'USD',
      source: 'manual',
    }
  })
}

export function mergeNamecheapDashboardDomains(
  manual: NamecheapManualDomain[],
  apiDomains: BillingDashboardDomain[],
): BillingDashboardDomain[] {
  const byName = new Map<string, BillingDashboardDomain>()
  for (const row of mapManualNamecheapDomains(manual)) {
    byName.set(row.name.toLowerCase(), row)
  }
  for (const row of apiDomains) {
    const key = row.name.toLowerCase()
    if (!byName.has(key)) byName.set(key, row)
  }
  return [...byName.values()].sort((a, b) => a.daysUntilRenewal - b.daysUntilRenewal)
}
