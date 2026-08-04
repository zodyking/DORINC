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
}

async function openRouterFetch<T>(apiKey: string, path: string): Promise<T> {
  const res = await fetch(`https://openrouter.ai/api/v1${path}`, {
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
  })
  const payload = await res.json().catch(() => ({})) as T & { error?: { message?: string } }
  if (!res.ok) {
    throw new Error((payload as { error?: { message?: string } }).error?.message || `OpenRouter returned ${res.status}`)
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
  }
}

export async function resolveOpenRouterBilling(db: Db): Promise<{
  credits: OpenRouterCreditsSummary | null
  keyUsage: OpenRouterKeySummary | null
  internalMonthlyUsd: number
  error: string | null
}> {
  const aiSettings = await getAiProviderSettings(db)
  const summary = await getAiUsageSummary(db)
  const internalMonthlyUsd = Number(summary.estimatedCostUsd ?? 0)
  const errors: string[] = []

  if (!aiSettings.hasApiKey) {
    return {
      credits: null,
      keyUsage: null,
      internalMonthlyUsd,
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
      error: (e as Error).message,
    }
  }

  if (!apiKey) {
    return {
      credits: null,
      keyUsage: null,
      internalMonthlyUsd,
      error: 'OpenRouter API key not configured in Control Panel → AI',
    }
  }

  let credits: OpenRouterCreditsSummary | null = null
  let keyUsage: OpenRouterKeySummary | null = null

  try {
    credits = await fetchOpenRouterCredits(apiKey)
  }
  catch (e) {
    errors.push((e as Error).message)
  }

  try {
    keyUsage = await fetchOpenRouterKeyUsage(apiKey)
  }
  catch (e) {
    errors.push((e as Error).message)
  }

  if (!credits && !keyUsage) {
    return {
      credits: null,
      keyUsage: null,
      internalMonthlyUsd,
      error: errors.join('; ') || 'OpenRouter billing data unavailable',
    }
  }

  return {
    credits,
    keyUsage,
    internalMonthlyUsd,
    error: errors.length ? errors.join('; ') : null,
  }
}
