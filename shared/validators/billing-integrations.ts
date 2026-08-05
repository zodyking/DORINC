import { z } from 'zod'

function emptyToUndefined(value: unknown): unknown {
  if (value === '' || value === null) return undefined
  return value
}

const optionalApiKey = z.preprocess(
  emptyToUndefined,
  z.string().trim().min(8).max(512).optional(),
)

const optionalShortText = (max: number) => z.preprocess(
  emptyToUndefined,
  z.string().trim().min(1).max(max).optional(),
)

export const namecheapManualDomainSchema = z.object({
  name: z.string().trim().min(3).max(253),
  renewalDate: z.string().trim().regex(/^\d{4}-\d{2}-\d{2}$/),
  renewalCost: z.coerce.number().min(0).max(999999),
})

export type NamecheapManualDomain = z.infer<typeof namecheapManualDomainSchema>

export const billingIntegrationsPatchSchema = z.object({
  vultrEnabled: z.boolean().optional(),
  vultrApiKey: optionalApiKey,
  vultrMonitoredInstanceIds: z.array(z.string().trim().min(1).max(64)).max(100).optional(),
  namecheapEnabled: z.boolean().optional(),
  namecheapApiUser: optionalShortText(120),
  namecheapUsername: optionalShortText(120),
  namecheapClientIp: optionalShortText(45),
  namecheapApiKey: optionalApiKey,
  namecheapUseSandbox: z.boolean().optional(),
  namecheapMonitoredDomains: z.array(z.string().trim().min(3).max(253)).max(500).optional(),
  namecheapManualDomains: z.array(namecheapManualDomainSchema).max(500).optional(),
  openrouterBillingEnabled: z.boolean().optional(),
  openrouterManagementKey: optionalApiKey,
})

export type BillingIntegrationsPatch = z.infer<typeof billingIntegrationsPatchSchema>

export interface BillingIntegrationsView {
  id: string
  vultrEnabled: boolean
  hasVultrApiKey: boolean
  vultrMonitoredInstanceIds: string[]
  namecheapEnabled: boolean
  hasNamecheapApiKey: boolean
  namecheapApiUser: string | null
  namecheapUsername: string | null
  namecheapClientIp: string | null
  namecheapUseSandbox: boolean
  namecheapMonitoredDomains: string[]
  namecheapManualDomains: NamecheapManualDomain[]
  openrouterBillingEnabled: boolean
  hasOpenrouterManagementKey: boolean
  hasAiOpenRouterKey: boolean
  updatedAt: string | Date
}

export interface BillingDashboardDomain {
  name: string
  renewalDate: string
  daysUntilRenewal: number
  autoRenew: boolean
  premium: boolean
  renewalCost: number | null
  renewalCostStatus: 'ok' | 'premium-domain-price-unavailable' | 'pricing-unavailable'
  currency: string
  source: 'manual' | 'api'
}

export interface BillingDashboardPayload {
  configured: {
    vultr: boolean
    namecheap: boolean
    openrouter: boolean
  }
  vultr: {
    configured: boolean
    currency: string
    monthToDateUsage: number | null
    accountBalance: number | null
    lastPaymentDate: string | null
    lastPaymentAmount: number | null
    monitoredInstances: Array<{
      id: string
      label: string
      region: string
      plan: string
      status: string
      mainIp: string | null
    }>
    invoices: Array<{
      id: string
      date: string
      amount: number
      description: string
    }>
    error: string | null
    lastUpdated: string
  }
  namecheap: {
    configured: boolean
    domains: BillingDashboardDomain[]
    error: string | null
    lastUpdated: string
  }
  openrouter: {
    configured: boolean
    totalCredits: number | null
    totalUsage: number | null
    remainingCredits: number | null
    usageMonthly: number | null
    usageDaily: number | null
    limit: number | null
    limitRemaining: number | null
    internalMonthlyUsd: number | null
    creditsNote: string | null
    usageHistory: Array<{
      id: string
      date: string
      description: string
      amount: number
      model: string
      tokens: number
    }>
    currency: string
    error: string | null
    lastUpdated: string
  }
  totals: {
    currency: string
    estimatedMonthlyUsd: number
    estimatedYearlyUsd: number
    breakdown: {
      vultrUsd: number
      namecheapUsd: number
      openrouterUsd: number
    }
  }
  lastRefreshed: string
}
