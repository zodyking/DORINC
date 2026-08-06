import type { Db } from '../db/client'
import {
  isOpenRouterAuthErrorMessage,
  normalizeOpenRouterApiKey,
  openRouterAuthRecoveryMessage,
} from '../../shared/openrouter-auth'
import { getAiProviderSettings, getDecryptedApiKey } from './ai-provider.service'
import { getAiUsageSummary } from './ai-jobs.service'
import { getOpenRouterManagementKey } from './billing-integrations.service'

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

const OPENROUTER_FETCH_TIMEOUT_MS = 15_000

async function openRouterFetch<T>(apiKey: string, path: string): Promise<T> {
  const key = normalizeOpenRouterApiKey(apiKey)
  if (!key) {
    throw new Error(openRouterAuthRecoveryMessage())
  }

  let res: Response
  try {
    res = await fetch(`https://openrouter.ai/api/v1${path}`, {
      headers: {
        Authorization: `Bearer ${key}`,
        Accept: 'application/json',
      },
      signal: AbortSignal.timeout(OPENROUTER_FETCH_TIMEOUT_MS),
    })
  }
  catch (err) {
    if (err instanceof Error && err.name === 'TimeoutError') {
      throw new Error('OpenRouter API timed out', { cause: err })
    }
    throw err
  }
  const payload = await res.json().catch(() => ({})) as T & { error?: { message?: string } }
  if (!res.ok) {
    const message = (payload as { error?: { message?: string } }).error?.message || `OpenRouter returned ${res.status}`
    if (isOpenRouterAuthErrorMessage(message)) {
      throw new Error(openRouterAuthRecoveryMessage())
    }
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

async function loadOpenRouterCredits(
  managementKey: string | null,
  aiKey: string,
  keyUsage: OpenRouterKeySummary,
): Promise<{ credits: OpenRouterCreditsSummary | null, creditsNote: string | null }> {
  const creditErrors: string[] = []
  let creditsNote: string | null = null

  if (managementKey) {
    try {
      return { credits: await fetchOpenRouterCredits(managementKey), creditsNote: null }
    }
    catch (e) {
      creditErrors.push((e as Error).message)
    }
  }

  if (keyUsage.isManagementKey) {
    try {
      return { credits: await fetchOpenRouterCredits(aiKey), creditsNote: null }
    }
    catch (e) {
      creditErrors.push((e as Error).message)
    }
  }

  if (keyUsage.limitRemaining != null) {
    return {
      credits: {
        totalCredits: keyUsage.limit ?? keyUsage.limitRemaining,
        totalUsage: (keyUsage.limit ?? 0) - keyUsage.limitRemaining,
        remainingCredits: keyUsage.limitRemaining,
      },
      creditsNote: managementKey
        ? null
        : 'Showing key budget. Add an OpenRouter management key in Control Panel → Billing for account credits.',
    }
  }

  if (!managementKey) {
    creditsNote = 'Add an OpenRouter management key in Control Panel → Billing to monitor account credits.'
  }

  if (creditErrors.length) {
    creditsNote = [creditsNote, ...creditErrors].filter(Boolean).join(' ')
  }

  return { credits: null, creditsNote }
}

async function fetchKeyUsageWithFallback(
  aiKey: string,
  managementKey: string | null,
): Promise<{ keyUsage: OpenRouterKeySummary, usedKey: string }> {
  const candidates = [...new Set([aiKey, managementKey].filter(Boolean))] as string[]
  if (!candidates.length) {
    throw new Error('OpenRouter API key not configured in Control Panel → AI')
  }

  let lastError: Error | null = null
  for (const key of candidates) {
    try {
      return { keyUsage: await fetchOpenRouterKeyUsage(key), usedKey: key }
    }
    catch (e) {
      lastError = e as Error
      // Try the next key only for auth failures; surface other errors immediately.
      if (!isOpenRouterAuthErrorMessage(lastError.message)) {
        throw lastError
      }
    }
  }
  throw lastError ?? new Error(openRouterAuthRecoveryMessage())
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

  let apiKey: string
  try {
    apiKey = normalizeOpenRouterApiKey(await getDecryptedApiKey(db))
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

  let managementKey: string | null
  try {
    managementKey = normalizeOpenRouterApiKey(await getOpenRouterManagementKey(db)) || null
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

  if (!apiKey && !managementKey) {
    return {
      credits: null,
      keyUsage: null,
      internalMonthlyUsd,
      creditsNote: null,
      error: 'OpenRouter API key not configured in Control Panel → AI',
    }
  }

  let keyUsage: OpenRouterKeySummary
  let usedKey: string
  try {
    ;({ keyUsage, usedKey } = await fetchKeyUsageWithFallback(apiKey, managementKey))
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

  const { credits, creditsNote } = await loadOpenRouterCredits(managementKey, usedKey, keyUsage)

  return {
    credits,
    keyUsage,
    internalMonthlyUsd,
    creditsNote,
    error: null,
  }
}
