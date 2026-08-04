import { z } from 'zod'

export const billingIntegrationsPatchSchema = z.object({
  vultrEnabled: z.boolean().optional(),
  vultrApiKey: z.string().trim().min(8).max(512).optional(),
  vultrMonitoredInstanceIds: z.array(z.string().trim().min(1).max(64)).max(100).optional(),
  namecheapEnabled: z.boolean().optional(),
  namecheapApiUser: z.string().trim().min(1).max(120).optional(),
  namecheapUsername: z.string().trim().min(1).max(120).optional(),
  namecheapClientIp: z.string().trim().min(7).max(45).optional(),
  namecheapApiKey: z.string().trim().min(8).max(512).optional(),
  namecheapUseSandbox: z.boolean().optional(),
  namecheapMonitoredDomains: z.array(z.string().trim().min(3).max(253)).max(500).optional(),
  openrouterBillingEnabled: z.boolean().optional(),
  openrouterManagementKey: z.string().trim().min(8).max(512).optional(),
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
  openrouterBillingEnabled: boolean
  hasOpenrouterManagementKey: boolean
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
