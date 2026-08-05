import type { Db } from '../db/client'
import type { BillingDashboardPayload } from '../../shared/validators/billing-integrations'
import {
  getBillingIntegrations,
  getVultrApiKey,
} from './billing-integrations.service'
import { getAiProviderSettings } from './ai-provider.service'
import { mapDomainRenewalsForDashboard } from './domain-renewals.service'
import { resolveOpenRouterBilling } from './openrouter-billing.service'
import { listAiUsageLogs } from './ai-jobs.service'
import {
  fetchVultrAccount,
  fetchVultrBillingHistory,
  fetchVultrInstances,
} from './vultr-billing.service'

function roundMoney(value: number): number {
  return Math.round(value * 100) / 100
}

const AI_USAGE_FEATURE_LABELS: Record<string, string> = {
  service_log_extraction: 'Service log extraction',
  invoice_description: 'Invoice description',
  platform_help: 'Platform help',
  thumbnail_generate: 'Thumbnail generation',
}

function formatAiUsageDescription(featureType: string, model: string): string {
  const label = AI_USAGE_FEATURE_LABELS[featureType] ?? featureType.replace(/_/g, ' ')
  return `${label} · ${model}`
}

async function loadOpenRouterUsageHistory(db: Db) {
  const { items } = await listAiUsageLogs(db, { limit: 12, offset: 0 })
  return items.map(row => ({
    id: row.id,
    date: row.createdAt.toISOString(),
    description: formatAiUsageDescription(row.featureType, row.model),
    amount: roundMoney(Number(row.estimatedCostUsd ?? 0)),
    model: row.model,
    tokens: row.totalTokens,
  }))
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
    configured: settings.domainRenewals.length > 0,
    domains: mapDomainRenewalsForDashboard(settings.domainRenewals),
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
    usageHistory: [],
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

  if (settings.openrouterBillingEnabled) {
    try {
      const [resolved, usageHistory] = await Promise.all([
        resolveOpenRouterBilling(db),
        loadOpenRouterUsageHistory(db),
      ])
      openrouterBlock.totalCredits = resolved.credits?.totalCredits ?? null
      openrouterBlock.totalUsage = resolved.credits?.totalUsage ?? null
      openrouterBlock.remainingCredits = resolved.credits?.remainingCredits ?? null
      openrouterBlock.usageMonthly = resolved.keyUsage?.usageMonthly ?? null
      openrouterBlock.usageDaily = resolved.keyUsage?.usageDaily ?? null
      openrouterBlock.limit = resolved.keyUsage?.limit ?? null
      openrouterBlock.limitRemaining = resolved.keyUsage?.limitRemaining ?? null
      openrouterBlock.internalMonthlyUsd = resolved.internalMonthlyUsd
      openrouterBlock.creditsNote = resolved.creditsNote
      openrouterBlock.usageHistory = usageHistory
      openrouterBlock.error = resolved.error
    }
    catch (e) {
      openrouterBlock.error = (e as Error).message
    }
  }

  const vultrUsd = vultrBlock.monthToDateUsage ?? 0
  const openrouterUsd = openrouterBlock.usageMonthly ?? openrouterBlock.internalMonthlyUsd ?? 0
  const namecheapMonthlyUsd = namecheapBlock.domains
    .filter(d => d.daysUntilRenewal >= 0 && d.daysUntilRenewal <= 30)
    .reduce((sum, d) => sum + d.renewalCost, 0)
  const namecheapYearlyUsd = namecheapBlock.domains
    .filter(d => d.daysUntilRenewal >= 0 && d.daysUntilRenewal <= 365)
    .reduce((sum, d) => sum + d.renewalCost, 0)

  const estimatedMonthlyUsd = roundMoney(vultrUsd + openrouterUsd + namecheapMonthlyUsd)
  const estimatedYearlyUsd = roundMoney((vultrUsd * 12) + (openrouterUsd * 12) + namecheapYearlyUsd)

  return {
    configured: {
      vultr: settings.vultrEnabled && settings.hasVultrApiKey,
      namecheap: settings.domainRenewals.length > 0,
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
