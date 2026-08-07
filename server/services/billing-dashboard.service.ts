import type { Db } from '../db/client'
import type { BillingDashboardDomain, BillingDashboardPayload } from '../../shared/validators/billing-integrations'
import {
  getBillingIntegrations,
  getCloudflareAccountId,
  getCloudflareApiToken,
  getVultrApiKey,
} from './billing-integrations.service'
import { getAiProviderSettings } from './ai-provider.service'
import { resolveOpenRouterBilling } from './openrouter-billing.service'
import { listAiUsageLogs } from './ai-jobs.service'
import {
  attachVultrInstancePlanCosts,
  fetchVultrAccount,
  fetchVultrBillingHistory,
  fetchVultrInstances,
  fetchVultrPlanPriceMap,
  sumVultrMonthlyPlanCost,
} from './vultr-billing.service'
import {
  daysUntilIso,
  fetchCloudflareRegistrations,
  sumCloudflareAnnualRenewals,
  sumCloudflareRenewalsInWindow,
} from './cloudflare-billing.service'
import { buildBillingOutlook } from './billing-outlook.service'
import { resolveOpenRouterMonthlySpend } from '../../shared/billing-openrouter-spend'

function roundMoney(value: number): number {
  return Math.round(value * 100) / 100
}

const AI_USAGE_FEATURE_LABELS: Record<string, string> = {
  service_log_extraction: 'Service log extraction',
  invoice_description: 'Invoice description',
  platform_help: 'Susan help',
  daily_summary: 'Susan daily summary',
  thumbnail_generate: 'Thumbnail generation',
}

function formatAiUsageDescription(featureType: string, model: string): string {
  const label = AI_USAGE_FEATURE_LABELS[featureType] ?? featureType.replace(/_/g, ' ')
  return `${label} · ${model}`
}

function toDashboardDomain(row: {
  domainName: string
  expiresAt: string | null
  registeredAt: string | null
  autoRenew: boolean
  locked: boolean
  status: string
  privacyMode: string | null
  renewalCost: number | null
  currency: string
}): BillingDashboardDomain {
  const days = daysUntilIso(row.expiresAt) ?? 0
  const renewalDate = row.expiresAt
    ? row.expiresAt.slice(0, 10)
    : '—'
  return {
    name: row.domainName,
    renewalDate,
    daysUntilRenewal: days,
    renewalCost: row.renewalCost ?? 0,
    currency: row.currency || 'USD',
    registeredAt: row.registeredAt,
    autoRenew: row.autoRenew,
    locked: row.locked,
    status: row.status,
    privacyMode: row.privacyMode,
  }
}

/** Preserve sub-cent AI costs (DB scale is 4+; do not round to cents). */
function roundAiUsageMoney(value: number): number {
  return Math.round(value * 1_000_000) / 1_000_000
}

async function loadOpenRouterUsageHistory(db: Db) {
  const { items } = await listAiUsageLogs(db, { limit: 12, offset: 0 })
  return items.map(row => ({
    id: row.id,
    date: row.createdAt.toISOString(),
    description: formatAiUsageDescription(row.featureType, row.model),
    amount: roundAiUsageMoney(Number(row.estimatedCostUsd ?? 0)),
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
    planCostMonthly: null,
    monitoredInstances: [],
    invoices: [],
    hasPortalCredentials: settings.hasVultrUsername || settings.hasVultrPassword,
    error: null,
    lastUpdated: nowIso,
  }

  const cloudflareBlock: BillingDashboardPayload['cloudflare'] = {
    configured: settings.cloudflareEnabled && settings.hasCloudflareApiToken && !!settings.cloudflareAccountId,
    domains: [],
    hasPortalCredentials: settings.hasCloudflareUsername || settings.hasCloudflarePassword,
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
    hasPortalCredentials: settings.hasOpenrouterUsername || settings.hasOpenrouterPassword,
    error: null,
    lastUpdated: nowIso,
  }

  if (settings.vultrEnabled && settings.hasVultrApiKey) {
    try {
      const apiKey = await getVultrApiKey(db)
      if (!apiKey) throw new Error('Vultr API key missing')
      const [account, instances, history, planPrices] = await Promise.all([
        fetchVultrAccount(apiKey),
        fetchVultrInstances(apiKey),
        fetchVultrBillingHistory(apiKey),
        fetchVultrPlanPriceMap(apiKey),
      ])
      const watched = new Set(settings.vultrMonitoredInstanceIds)
      const monitored = attachVultrInstancePlanCosts(
        instances.filter(row => watched.size > 0 && watched.has(row.id)),
        planPrices,
      )
      vultrBlock.monthToDateUsage = account.pendingCharges
      vultrBlock.accountBalance = account.balance
      vultrBlock.planCostMonthly = sumVultrMonthlyPlanCost(monitored)
      vultrBlock.monitoredInstances = monitored
      vultrBlock.invoices = history
    }
    catch (e) {
      vultrBlock.error = (e as Error).message
    }
  }

  if (cloudflareBlock.configured) {
    try {
      const [apiToken, accountId] = await Promise.all([
        getCloudflareApiToken(db),
        getCloudflareAccountId(db),
      ])
      if (!apiToken || !accountId) throw new Error('Cloudflare credentials missing')
      const registrations = await fetchCloudflareRegistrations(apiToken, accountId)
      cloudflareBlock.domains = registrations
        .map(toDashboardDomain)
        .sort((a, b) => a.daysUntilRenewal - b.daysUntilRenewal)
    }
    catch (e) {
      cloudflareBlock.error = (e as Error).message
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

  const vultrUsd = vultrBlock.planCostMonthly ?? 0
  // Do not use ?? alone — OpenRouter often reports usage_monthly: 0 while
  // internal logs still have spend (would freeze AI yearly at $0).
  const openrouterUsd = resolveOpenRouterMonthlySpend(
    openrouterBlock.usageMonthly,
    openrouterBlock.internalMonthlyUsd,
  )
  const cloudflareMonthlyUsd = sumCloudflareRenewalsInWindow(
    cloudflareBlock.domains.map(d => ({
      daysUntilRenewal: d.daysUntilRenewal,
      renewalCost: d.renewalCost,
    })),
    30,
  )
  // Annual domain budget = sum of every domain renewal (each renews ~once/year),
  // not only those due inside a rolling 365-day window.
  const cloudflareYearlyUsd = sumCloudflareAnnualRenewals(
    cloudflareBlock.domains.map(d => ({ renewalCost: d.renewalCost })),
  )

  const estimatedMonthlyUsd = roundMoney(vultrUsd + openrouterUsd + cloudflareMonthlyUsd)
  const estimatedYearlyUsd = roundMoney((vultrUsd * 12) + (openrouterUsd * 12) + cloudflareYearlyUsd)
  const yearlyVultrUsd = roundMoney(vultrUsd * 12)
  const yearlyOpenrouterUsd = roundMoney(openrouterUsd * 12)

  const outlook = buildBillingOutlook({
    vultrPlanMonthly: vultrUsd,
    openrouterMonthly: openrouterUsd,
    vultrInvoices: vultrBlock.invoices,
    openrouterUsage: openrouterBlock.usageHistory,
    domainRenewals: cloudflareBlock.domains.map(d => ({
      expiresAt: d.renewalDate !== '—' ? `${d.renewalDate}T00:00:00.000Z` : null,
      renewalCost: d.renewalCost,
    })),
  })

  return {
    configured: {
      vultr: settings.vultrEnabled && settings.hasVultrApiKey,
      cloudflare: cloudflareBlock.configured,
      openrouter: settings.openrouterBillingEnabled && aiSettings.hasApiKey,
    },
    vultr: vultrBlock,
    cloudflare: cloudflareBlock,
    openrouter: openrouterBlock,
    totals: {
      currency: 'USD',
      estimatedMonthlyUsd,
      estimatedYearlyUsd,
      breakdown: {
        vultrUsd: roundMoney(vultrUsd),
        cloudflareUsd: roundMoney(cloudflareMonthlyUsd),
        openrouterUsd: roundMoney(openrouterUsd),
      },
      breakdownYearly: {
        vultrUsd: yearlyVultrUsd,
        cloudflareUsd: roundMoney(cloudflareYearlyUsd),
        openrouterUsd: yearlyOpenrouterUsd,
      },
    },
    outlook: {
      currency: 'USD',
      points: outlook,
    },
    lastRefreshed: nowIso,
  }
}
