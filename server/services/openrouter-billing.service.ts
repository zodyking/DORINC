import type { Db } from '../db/client'
import { getAiProviderSettings, getDecryptedApiKey } from './ai-provider.service'
import { getAiUsageSummary } from './ai-jobs.service'

export interface OpenRouterCreditsSummary {
  totalCredits: number
  totalUsage: number
  remainingCredits: number
}

export interface OpenRouterKeySummary {
  usage: number
  usageDaily: number
  usageMonthly: number
  limit: number | null
  limitRemaining: number | null
  isManagementKey: boolean
}

async function openRouterFetch<T>(apiKey: string, path: string): Promise<T> {
  const res = await fetch(`https://openrouter.ai/api/v1${path}`, {
    headers: {
      Authorization: `Bearer ${apiKey}`,
      Accept: 'application/json',
    },
  })
  const payload = await res.json().catch(() => ({})) as T & { error?: { message?: string } }
  if (!res.ok) {
    const message = (payload as { error?: { message?: string } }).error?.message || `OpenRouter returned ${res.status}`
    throw new Error(message)
  }
  return payload
}

export async function fetchOpenRouterCredits(apiKey: string): Promise<OpenRouterCreditsSummary> {
  const payload = await openRouterFetch<{ data?: { total_credits?: number, total_usage?: number } }>(
    apiKey,
    '/credits',
  )
  const totalCredits = Number(payload.data?.total_credits ?? 0)
  const totalUsage = Number(payload.data?.total_usage ?? 0)
  return {
    totalCredits,
    totalUsage,
    remainingCredits: totalCredits - totalUsage,
  }
}

export async function fetchOpenRouterKeyUsage(apiKey: string): Promise<OpenRouterKeySummary> {
  const payload = await openRouterFetch<{ data?: Record<string, unknown> }>(apiKey, '/key')
  const data = payload.data ?? {}
  return {
    usage: Number(data.usage ?? 0),
    usageDaily: Number(data.usage_daily ?? 0),
    usageMonthly: Number(data.usage_monthly ?? 0),
    limit: data.limit != null ? Number(data.limit) : null,
    limitRemaining: data.limit_remaining != null ? Number(data.limit_remaining) : null,
    isManagementKey: data.is_management_key === true,
  }
}

export async function resolveOpenRouterBilling(db: Db): Promise<{
  credits: OpenRouterCreditsSummary | null
  keyUsage: OpenRouterKeySummary | null
  internalMonthlyUsd: number
  creditsNote: string | null
  error: string | null
}> {
  const aiSettings = await getAiProviderSettings(db)
  const summary = await getAiUsageSummary(db)
  const internalMonthlyUsd = Number(summary.estimatedCostUsd ?? 0)

  if (!aiSettings.hasApiKey) {
    return {
      credits: null,
      keyUsage: null,
      internalMonthlyUsd,
      creditsNote: null,
      error: 'OpenRouter API key not configured in Control Panel → AI',
    }
  }

  let apiKey: string | null = null
  try {
    apiKey = await getDecryptedApiKey(db)
  }
  catch (e) {
    return {
      credits: null,
      keyUsage: null,
      internalMonthlyUsd,
      creditsNote: null,
      error: (e as Error).message,
    }
  }

  if (!apiKey) {
    return {
      credits: null,
      keyUsage: null,
      internalMonthlyUsd,
      creditsNote: null,
      error: 'OpenRouter API key not configured in Control Panel → AI',
    }
  }

  let credits: OpenRouterCreditsSummary | null = null
  let keyUsage: OpenRouterKeySummary | null = null
  let creditsNote: string | null = null
  const creditErrors: string[] = []

  try {
    keyUsage = await fetchOpenRouterKeyUsage(apiKey)
  }
  catch (e) {
    return {
      credits: null,
      keyUsage: null,
      internalMonthlyUsd,
      creditsNote: null,
      error: (e as Error).message,
    }
  }

  if (keyUsage.isManagementKey) {
    try {
      credits = await fetchOpenRouterCredits(apiKey)
    }
    catch (e) {
      creditErrors.push((e as Error).message)
    }
  }
  else {
    creditsNote = 'Account-wide credits require an OpenRouter management key. Showing usage for your AI API key.'
  }

  if (creditErrors.length) {
    creditsNote = creditErrors.join('; ')
  }

  return {
    credits,
    keyUsage,
    internalMonthlyUsd,
    creditsNote,
    error: null,
  }
}
