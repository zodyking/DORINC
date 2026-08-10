import { z } from 'zod'

function emptyToUndefined(value: unknown): unknown {
  if (value === '' || value === null) return undefined
  return value
}

const optionalApiKey = z.preprocess(
  emptyToUndefined,
  z.string().trim().min(8).max(512).optional(),
)

const optionalCredential = z.preprocess(
  emptyToUndefined,
  z.string().trim().min(1).max(512).optional(),
)

const optionalAccountId = z.preprocess(
  emptyToUndefined,
  z.string().trim().min(8).max(64).optional(),
)

export const domainRenewalSchema = z.object({
  name: z.string().trim().min(3).max(253),
  renewalDate: z.string().trim().regex(/^\d{4}-\d{2}-\d{2}$/),
  renewalCost: z.coerce.number().min(0).max(999999),
})

export type DomainRenewal = z.infer<typeof domainRenewalSchema>

/** @deprecated Use DomainRenewal */
export type NamecheapManualDomain = DomainRenewal

export const billingProviderKeySchema = z.enum(['vultr', 'cloudflare', 'openrouter', 'quo'])
export type BillingProviderKey = z.infer<typeof billingProviderKeySchema>

export const billingIntegrationsPatchSchema = z.object({
  vultrEnabled: z.boolean().optional(),
  vultrApiKey: optionalApiKey,
  vultrMonitoredInstanceIds: z.array(z.string().trim().min(1).max(64)).max(100).optional(),
  vultrUsername: optionalCredential,
  vultrPassword: optionalCredential,
  /** @deprecated Kept for backward-compatible saves; ignored by the Cloudflare dashboard path. */
  domainRenewals: z.array(domainRenewalSchema).max(500).optional(),
  cloudflareEnabled: z.boolean().optional(),
  cloudflareAccountId: optionalAccountId,
  cloudflareApiToken: optionalApiKey,
  cloudflareUsername: optionalCredential,
  cloudflarePassword: optionalCredential,
  openrouterBillingEnabled: z.boolean().optional(),
  openrouterManagementKey: optionalApiKey,
  openrouterUsername: optionalCredential,
  openrouterPassword: optionalCredential,
})

export type BillingIntegrationsPatch = z.infer<typeof billingIntegrationsPatchSchema>

export interface BillingIntegrationsView {
  id: string
  vultrEnabled: boolean
  hasVultrApiKey: boolean
  vultrMonitoredInstanceIds: string[]
  hasVultrUsername: boolean
  hasVultrPassword: boolean
  domainRenewals: DomainRenewal[]
  cloudflareEnabled: boolean
  cloudflareAccountId: string | null
  hasCloudflareApiToken: boolean
  hasCloudflareUsername: boolean
  hasCloudflarePassword: boolean
  openrouterBillingEnabled: boolean
  hasOpenrouterManagementKey: boolean
  hasAiOpenRouterKey: boolean
  hasOpenrouterUsername: boolean
  hasOpenrouterPassword: boolean
  updatedAt: string | Date
}

export interface BillingDashboardDomain {
  name: string
  renewalDate: string
  daysUntilRenewal: number
  renewalCost: number
  currency: string
  registeredAt: string | null
  autoRenew: boolean | null
  locked: boolean | null
  status: string | null
  privacyMode: string | null
}

export interface BillingVultrInstance {
  id: string
  label: string
  hostname: string | null
  os: string | null
  region: string
  plan: string
  vcpuCount: number | null
  ramMb: number | null
  diskGb: number | null
  allowedBandwidthGb: number | null
  status: string
  powerStatus: string | null
  serverStatus: string | null
  mainIp: string | null
  v6MainIp: string | null
  internalIp: string | null
  gatewayV4: string | null
  dateCreated: string | null
  features: string[]
  tags: string[]
  monthlyPlanCost: number | null
}

export interface BillingSpendPoint {
  key: string
  label: string
  actualUsd: number | null
  projectedUsd: number | null
}

export interface BillingQuoPhoneNumber {
  id: string
  number: string
  formattedNumber: string | null
  name: string | null
}

export interface BillingDashboardPayload {
  configured: {
    vultr: boolean
    cloudflare: boolean
    openrouter: boolean
    quo: boolean
  }
  vultr: {
    configured: boolean
    currency: string
    monthToDateUsage: number | null
    accountBalance: number | null
    planCostMonthly: number | null
    monitoredInstances: BillingVultrInstance[]
    invoices: Array<{
      id: string
      date: string
      amount: number
      description: string
    }>
    hasPortalCredentials: boolean
    error: string | null
    lastUpdated: string
  }
  cloudflare: {
    configured: boolean
    domains: BillingDashboardDomain[]
    hasPortalCredentials: boolean
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
    hasPortalCredentials: boolean
    error: string | null
    lastUpdated: string
  }
  /** Quo SMS — prepaid credits live in Quo; API exposes numbers/connection only. */
  quo: {
    configured: boolean
    enabled: boolean
    fromNumber: string | null
    phoneNumbers: BillingQuoPhoneNumber[]
    phoneCount: number
    creditsNote: string | null
    error: string | null
    lastUpdated: string
  }
  totals: {
    currency: string
    estimatedMonthlyUsd: number
    estimatedYearlyUsd: number
    /** Monthly run-rate shares (hosting/AI) plus domains due within ~30 days. */
    breakdown: {
      vultrUsd: number
      cloudflareUsd: number
      openrouterUsd: number
    }
    /** Full-year outlook shares — hosting/AI annualized + all domain renewals. */
    breakdownYearly: {
      vultrUsd: number
      cloudflareUsd: number
      openrouterUsd: number
    }
  }
  outlook: {
    currency: string
    points: BillingSpendPoint[]
  }
  lastRefreshed: string
}

export const billingCredentialsRevealSchema = z.object({
  password: z.string().min(1).max(200),
  provider: billingProviderKeySchema,
})

export type BillingCredentialsReveal = z.infer<typeof billingCredentialsRevealSchema>
