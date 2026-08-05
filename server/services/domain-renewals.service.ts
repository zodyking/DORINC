import type { BillingDashboardDomain, DomainRenewal } from '../../shared/validators/billing-integrations'

function daysUntil(date: Date): number {
  const ms = date.getTime() - Date.now()
  return Math.ceil(ms / (24 * 60 * 60 * 1000))
}

export function normalizeDomainRenewals(rows: DomainRenewal[]): DomainRenewal[] {
  return rows
    .map(row => ({
      name: row.name.trim().toLowerCase(),
      renewalDate: row.renewalDate.trim(),
      renewalCost: Math.round(Number(row.renewalCost) * 100) / 100,
    }))
    .filter(row =>
      row.name.length >= 3
      && /^\d{4}-\d{2}-\d{2}$/.test(row.renewalDate)
      && Number.isFinite(row.renewalCost)
      && row.renewalCost >= 0,
    )
}

export function mapDomainRenewalsForDashboard(rows: DomainRenewal[]): BillingDashboardDomain[] {
  return normalizeDomainRenewals(rows)
    .map((row) => {
      const expiry = new Date(`${row.renewalDate}T00:00:00.000Z`)
      const days = Number.isNaN(expiry.getTime()) ? 0 : daysUntil(expiry)
      return {
        name: row.name,
        renewalDate: row.renewalDate,
        daysUntilRenewal: days,
        renewalCost: row.renewalCost,
        currency: 'USD',
      }
    })
    .sort((a, b) => a.daysUntilRenewal - b.daysUntilRenewal)
}
