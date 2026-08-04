import type { Db } from '../db/client'
import type { BillingDashboardPayload } from '../../shared/validators/billing-integrations'
import {
  getBillingIntegrations,
  getNamecheapCredentials,
  getVultrApiKey,
} from './billing-integrations.service'
import { getAiProviderSettings } from './ai-provider.service'
import {
  domainTld,
  fetchNamecheapDomains,
  fetchNamecheapRenewalPrice,
  parseNamecheapExpiry,
} from './namecheap-billing.service'
import { mapManualNamecheapDomains, mergeNamecheapDashboardDomains } from './namecheap-manual-domains.service'
import { resolveOpenRouterBilling } from './openrouter-billing.service'
import {
  fetchVultrAccount,
  fetchVultrBillingHistory,
  fetchVultrInstances,
} from './vultr-billing.service'

function daysUntil(date: Date): number {
  const ms = date.getTime() - Date.now()
  return Math.ceil(ms / (24 * 60 * 60 * 1000))
}

function roundMoney(value: number): number {
  return Math.round(value * 100) / 100
}

export async function buildBillingDashboard(db: Db): Promise<BillingDashboardPayload> {
  const settings = await getBillingIntegrations(db)
  const aiSettings = await getAiProviderSettings(db)
  const nowIso = new Date().toISOString()

  const vultrBlock: BillingDashboardPayload['vultr'] = {
    configured: settings.vultrEnabled && settings.hasVultrApiKey,
    currency: 'USD',
    monthToDateUsage: null,
    accountBalance: null,
    lastPaymentDate: null,
    lastPaymentAmount: null,
    monitoredInstances: [],
    invoices: [],
    error: null,
    lastUpdated: nowIso,
  }

  const namecheapBlock: BillingDashboardPayload['namecheap'] = {
    configured: settings.namecheapEnabled
      && (settings.hasNamecheapApiKey || settings.namecheapManualDomains.length > 0),
    domains: [],
    error: null,
    lastUpdated: nowIso,
  }

  const openrouterBlock: BillingDashboardPayload['openrouter'] = {
    configured: settings.openrouterBillingEnabled && aiSettings.hasApiKey,
    totalCredits: null,
    totalUsage: null,
    remainingCredits: null,
    usageMonthly: null,
    usageDaily: null,
    limit: null,
    limitRemaining: null,
    internalMonthlyUsd: null,
    creditsNote: null,
    currency: 'USD',
    error: null,
    lastUpdated: nowIso,
  }

  if (settings.vultrEnabled && settings.hasVultrApiKey) {
    try {
      const apiKey = await getVultrApiKey(db)
      if (!apiKey) throw new Error('Vultr API key missing')
      const [account, instances, history] = await Promise.all([
        fetchVultrAccount(apiKey),
        fetchVultrInstances(apiKey),
        fetchVultrBillingHistory(apiKey),
      ])
      const watched = new Set(settings.vultrMonitoredInstanceIds)
      vultrBlock.monthToDateUsage = account.pendingCharges
      vultrBlock.accountBalance = account.balance
      vultrBlock.lastPaymentDate = account.lastPaymentDate
      vultrBlock.lastPaymentAmount = account.lastPaymentAmount
      vultrBlock.monitoredInstances = instances.filter(row =>
        watched.size === 0 ? false : watched.has(row.id),
      )
      vultrBlock.invoices = history
    }
    catch (e) {
      vultrBlock.error = (e as Error).message
    }
  }

  if (settings.namecheapEnabled) {
    const apiDomains: BillingDashboardDomain[] = []

    if (settings.hasNamecheapApiKey) {
      try {
        const creds = await getNamecheapCredentials(db)
        if (!creds) throw new Error('Namecheap credentials incomplete')
        const allDomains = await fetchNamecheapDomains(creds)
        const watched = new Set(settings.namecheapMonitoredDomains.map(d => d.toLowerCase()))
        const selected = allDomains.filter(row =>
          watched.size === 0 ? false : watched.has(row.name.toLowerCase()),
        )

        for (const row of selected) {
          const expiry = parseNamecheapExpiry(row.expires)
          const days = expiry ? daysUntil(expiry) : 0
          let renewalCost: number | null = null
          let renewalCostStatus: 'ok' | 'premium-domain-price-unavailable' | 'pricing-unavailable' = 'pricing-unavailable'

          if (row.isPremium) {
            renewalCostStatus = 'premium-domain-price-unavailable'
          }
          else {
            try {
              renewalCost = await fetchNamecheapRenewalPrice(creds, domainTld(row.name))
              renewalCostStatus = renewalCost == null ? 'pricing-unavailable' : 'ok'
            }
            catch {
              renewalCostStatus = 'pricing-unavailable'
            }
          }

          apiDomains.push({
            name: row.name,
            renewalDate: expiry ? expiry.toISOString().slice(0, 10) : row.expires,
            daysUntilRenewal: days,
            autoRenew: row.autoRenew,
            premium: row.isPremium,
            renewalCost,
            renewalCostStatus,
            currency: 'USD',
            source: 'api',
          })
        }
      }
      catch (e) {
        namecheapBlock.error = (e as Error).message
      }
    }

    namecheapBlock.domains = settings.hasNamecheapApiKey
      ? mergeNamecheapDashboardDomains(settings.namecheapManualDomains, apiDomains)
      : mapManualNamecheapDomains(settings.namecheapManualDomains)

    if (namecheapBlock.domains.length > 0 && namecheapBlock.error && settings.namecheapManualDomains.length > 0) {
      namecheapBlock.error = null
    }
  }

  if (settings.openrouterBillingEnabled) {
    try {
      const resolved = await resolveOpenRouterBilling(db)
      openrouterBlock.totalCredits = resolved.credits?.totalCredits ?? null
      openrouterBlock.totalUsage = resolved.credits?.totalUsage ?? null
      openrouterBlock.remainingCredits = resolved.credits?.remainingCredits ?? null
      openrouterBlock.usageMonthly = resolved.keyUsage?.usageMonthly ?? null
      openrouterBlock.usageDaily = resolved.keyUsage?.usageDaily ?? null
      openrouterBlock.limit = resolved.keyUsage?.limit ?? null
      openrouterBlock.limitRemaining = resolved.keyUsage?.limitRemaining ?? null
      openrouterBlock.internalMonthlyUsd = resolved.internalMonthlyUsd
      openrouterBlock.creditsNote = resolved.creditsNote
      openrouterBlock.error = resolved.error
    }
    catch (e) {
      openrouterBlock.error = (e as Error).message
    }
  }

  const vultrUsd = vultrBlock.monthToDateUsage ?? 0
  const openrouterUsd = openrouterBlock.usageMonthly ?? openrouterBlock.internalMonthlyUsd ?? 0
  const namecheapMonthlyUsd = namecheapBlock.domains
    .filter(d => d.daysUntilRenewal >= 0 && d.daysUntilRenewal <= 30 && d.renewalCost != null)
    .reduce((sum, d) => sum + (d.renewalCost ?? 0), 0)
  const namecheapYearlyUsd = namecheapBlock.domains
    .filter(d => d.daysUntilRenewal >= 0 && d.daysUntilRenewal <= 365 && d.renewalCost != null)
    .reduce((sum, d) => sum + (d.renewalCost ?? 0), 0)

  const estimatedMonthlyUsd = roundMoney(vultrUsd + openrouterUsd + namecheapMonthlyUsd)
  const estimatedYearlyUsd = roundMoney((vultrUsd * 12) + (openrouterUsd * 12) + namecheapYearlyUsd)

  return {
    configured: {
      vultr: settings.vultrEnabled && settings.hasVultrApiKey,
      namecheap: settings.namecheapEnabled
        && (settings.hasNamecheapApiKey || settings.namecheapManualDomains.length > 0),
      openrouter: settings.openrouterBillingEnabled && aiSettings.hasApiKey,
    },
    vultr: vultrBlock,
    namecheap: namecheapBlock,
    openrouter: openrouterBlock,
    totals: {
      currency: 'USD',
      estimatedMonthlyUsd,
      estimatedYearlyUsd,
      breakdown: {
        vultrUsd: roundMoney(vultrUsd),
        namecheapUsd: roundMoney(namecheapMonthlyUsd),
        openrouterUsd: roundMoney(openrouterUsd),
      },
    },
    lastRefreshed: nowIso,
  }
}
