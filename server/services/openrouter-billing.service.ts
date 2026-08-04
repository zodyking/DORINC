import type { Db } from '../db/client'
import { getAiProviderSettings, getDecryptedApiKey } from './ai-provider.service'
import { getAiUsageSummary } from './ai-jobs.service'
import { getOpenrouterManagementKey } from './billing-integrations.service'

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

export async function fetchOpenRouterCredits(managementKey: string): Promise<OpenRouterCreditsSummary> {
  const payload = await openRouterFetch<{ data?: { total_credits?: number, total_usage?: number } }>(
    managementKey,
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

export async function resolveOpenRouterBilling(db: Db, managementKey: string | null): Promise<{
  credits: OpenRouterCreditsSummary | null
  keyUsage: OpenRouterKeySummary | null
  internalMonthlyUsd: number
  error: string | null
}> {
  let credits: OpenRouterCreditsSummary | null = null
  let keyUsage: OpenRouterKeySummary | null = null
  const errors: string[] = []

  if (managementKey) {
    try {
      credits = await fetchOpenRouterCredits(managementKey)
    }
    catch (e) {
      errors.push((e as Error).message)
    }
  }

  try {
    const settings = await getAiProviderSettings(db)
    if (settings.enabled && settings.hasApiKey) {
      const inferenceKey = await getDecryptedApiKey(db)
      if (inferenceKey) {
        keyUsage = await fetchOpenRouterKeyUsage(inferenceKey)
      }
    }
  }
  catch (e) {
    errors.push((e as Error).message)
  }

  const summary = await getAiUsageSummary(db)
  const internalMonthlyUsd = Number(summary.estimatedCostUsd ?? 0)

  if (!managementKey && !keyUsage) {
    return {
      credits: null,
      keyUsage: null,
      internalMonthlyUsd,
      error: managementKey ? errors.join('; ') : 'OpenRouter management key not configured',
    }
  }

  return {
    credits,
    keyUsage,
    internalMonthlyUsd,
    error: errors.length ? errors.join('; ') : null,
  }
}

export async function testOpenRouterManagementKey(key: string): Promise<{ ok: true }> {
  await fetchOpenRouterCredits(key)
  return { ok: true }
}
