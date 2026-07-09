import { and, eq, gte, lt, sql } from 'drizzle-orm'
import type { Db } from '../db/client'
import {
  aiProviderSettings,
  aiUsageLogs,
  type AiFeatureType,
  type AiProvider,
} from '../db/schema/ai'
import { decryptBuffer, encryptBuffer } from './encryption.service'
import { getAppUrl } from './app-config.service'
import type { AiProviderSettingsPatch } from '../../shared/validators/ai'

export type AiProviderServiceErrorCode = 'NOT_CONFIGURED' | 'KEY_MISSING' | 'CONNECTION_FAILED' | 'SPEND_CAP_EXCEEDED'

export class AiSpendCapExceededError extends Error {
  constructor(
    public readonly period: 'daily' | 'monthly',
    public readonly capUsd: number,
    public readonly currentUsd: number,
  ) {
    super(`${period} AI spend cap exceeded`)
    this.name = 'AiSpendCapExceededError'
  }
}

export class AiProviderServiceError extends Error {
  constructor(public readonly code: AiProviderServiceErrorCode, message?: string) {
    super(message ?? code)
  }
}

export interface AiProviderSettingsView {
  id: string
  provider: AiProvider
  enabled: boolean
  hasApiKey: boolean
  defaultModel: string
  serviceLogExtractionModel: string | null
  invoiceDescriptionModel: string | null
  platformHelpModel: string | null
  serviceLogExtractionEnabled: boolean
  invoiceDescriptionEnabled: boolean
  platformHelpEnabled: boolean
  dailySpendCapUsd: string | null
  monthlySpendCapUsd: string | null
  updatedAt: Date
}

export interface AiHealthSummary {
  status: 'not_configured' | 'disabled' | 'active' | 'error'
  message: string
  provider: AiProvider | null
  defaultModel: string | null
  hasApiKey: boolean
  enabled: boolean
}

function toView(row: typeof aiProviderSettings.$inferSelect): AiProviderSettingsView {
  return {
    id: row.id,
    provider: row.provider,
    enabled: row.enabled,
    hasApiKey: row.encryptedApiKey != null && row.encryptedApiKey.length > 0,
    defaultModel: row.defaultModel,
    serviceLogExtractionModel: row.serviceLogExtractionModel,
    invoiceDescriptionModel: row.invoiceDescriptionModel,
    platformHelpModel: row.platformHelpModel,
    serviceLogExtractionEnabled: row.serviceLogExtractionEnabled,
    invoiceDescriptionEnabled: row.invoiceDescriptionEnabled,
    platformHelpEnabled: row.platformHelpEnabled,
    dailySpendCapUsd: row.dailySpendCapUsd,
    monthlySpendCapUsd: row.monthlySpendCapUsd,
    updatedAt: row.updatedAt,
  }
}

export async function ensureAiProviderSettings(db: Db): Promise<AiProviderSettingsView> {
  const [existing] = await db.select().from(aiProviderSettings).limit(1)
  if (existing) return toView(existing)

  const [created] = await db.insert(aiProviderSettings).values({}).returning()
  return toView(created!)
}

export async function getAiProviderSettings(db: Db): Promise<AiProviderSettingsView> {
  return ensureAiProviderSettings(db)
}

export async function updateAiProviderSettings(
  db: Db,
  patch: AiProviderSettingsPatch,
  actorId: string,
): Promise<AiProviderSettingsView> {
  const current = await ensureAiProviderSettings(db)
  const { apiKey, dailySpendCapUsd, monthlySpendCapUsd, ...rest } = patch

  const update: Partial<typeof aiProviderSettings.$inferInsert> = {
    ...rest,
    updatedBy: actorId,
    updatedAt: new Date(),
  }

  if (apiKey !== undefined) {
    update.encryptedApiKey = encryptBuffer(Buffer.from(apiKey, 'utf8'))
  }

  if (dailySpendCapUsd !== undefined) {
    update.dailySpendCapUsd = dailySpendCapUsd == null ? null : String(dailySpendCapUsd)
  }

  if (monthlySpendCapUsd !== undefined) {
    update.monthlySpendCapUsd = monthlySpendCapUsd == null ? null : String(monthlySpendCapUsd)
  }

  const [updated] = await db.update(aiProviderSettings)
    .set(update)
    .where(eq(aiProviderSettings.id, current.id))
    .returning()

  return toView(updated!)
}

/** Internal — decrypt stored OpenRouter key. Never expose to clients. */
export async function getDecryptedApiKey(db: Db): Promise<string | null> {
  const [row] = await db.select({ encryptedApiKey: aiProviderSettings.encryptedApiKey })
    .from(aiProviderSettings)
    .limit(1)

  if (!row?.encryptedApiKey?.length) return null

  try {
    return decryptBuffer(row.encryptedApiKey).toString('utf8')
  }
  catch {
    throw new AiProviderServiceError('KEY_MISSING', 'Stored API key could not be decrypted')
  }
}

export function modelForFeature(
  settings: AiProviderSettingsView,
  feature: AiFeatureType,
): string {
  switch (feature) {
    case 'service_log_extraction':
      return settings.serviceLogExtractionModel ?? settings.defaultModel
    case 'invoice_description':
      return settings.invoiceDescriptionModel ?? settings.defaultModel
    case 'platform_help':
      return settings.platformHelpModel ?? settings.defaultModel
  }
}

export async function getAiHealth(db: Db): Promise<AiHealthSummary> {
  const settings = await ensureAiProviderSettings(db)

  if (!settings.hasApiKey) {
    return {
      status: 'not_configured',
      message: 'OpenRouter API key not set',
      provider: settings.provider,
      defaultModel: settings.defaultModel,
      hasApiKey: false,
      enabled: settings.enabled,
    }
  }

  if (!settings.enabled) {
    return {
      status: 'disabled',
      message: 'AI disabled in settings',
      provider: settings.provider,
      defaultModel: settings.defaultModel,
      hasApiKey: true,
      enabled: false,
    }
  }

  return {
    status: 'active',
    message: `${settings.defaultModel} · key set`,
    provider: settings.provider,
    defaultModel: settings.defaultModel,
    hasApiKey: true,
    enabled: true,
  }
}

export interface OpenRouterTestResult {
  ok: boolean
  modelCount: number
}

/** Verify OpenRouter credentials via GET /api/v1/models. */
export async function testOpenRouterConnection(apiKey: string): Promise<OpenRouterTestResult> {
  const res = await fetch('https://openrouter.ai/api/v1/models', {
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'HTTP-Referer': getAppUrl(),
      'X-Title': 'DORINC Suite',
    },
  })

  if (!res.ok) {
    const body = await res.text().catch(() => '')
    throw new AiProviderServiceError(
      'CONNECTION_FAILED',
      body || `OpenRouter returned ${res.status}`,
    )
  }

  const payload = await res.json() as { data?: unknown[] }
  return {
    ok: true,
    modelCount: Array.isArray(payload.data) ? payload.data.length : 0,
  }
}

export async function testAiConnection(db: Db, overrideKey?: string): Promise<OpenRouterTestResult> {
  const apiKey = overrideKey ?? await getDecryptedApiKey(db)
  if (!apiKey) {
    throw new AiProviderServiceError('NOT_CONFIGURED', 'OpenRouter API key is not configured')
  }
  return testOpenRouterConnection(apiKey)
}

function startOfUtcDay(date = new Date()): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()))
}

function startOfUtcMonth(date = new Date()): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1))
}

export async function getDailyUsageCost(db: Db, day = new Date()): Promise<number> {
  const dayStart = startOfUtcDay(day)
  const dayEnd = new Date(dayStart)
  dayEnd.setUTCDate(dayEnd.getUTCDate() + 1)

  const [row] = await db.select({
    total: sql<string>`coalesce(sum(${aiUsageLogs.estimatedCostUsd}), 0)`,
  }).from(aiUsageLogs)
    .where(and(
      gte(aiUsageLogs.createdAt, dayStart),
      lt(aiUsageLogs.createdAt, dayEnd),
    ))

  return Number(row?.total ?? 0)
}

export async function getMonthlyUsageCost(db: Db, month = new Date()): Promise<number> {
  const monthStart = startOfUtcMonth(month)
  const monthEnd = new Date(Date.UTC(month.getUTCFullYear(), month.getUTCMonth() + 1, 1))

  const [row] = await db.select({
    total: sql<string>`coalesce(sum(${aiUsageLogs.estimatedCostUsd}), 0)`,
  }).from(aiUsageLogs)
    .where(and(
      gte(aiUsageLogs.createdAt, monthStart),
      lt(aiUsageLogs.createdAt, monthEnd),
    ))

  return Number(row?.total ?? 0)
}

export interface AiSpendCapStatus {
  dailyUsd: number
  monthlyUsd: number
  dailyCapUsd: number | null
  monthlyCapUsd: number | null
  dailyExceeded: boolean
  monthlyExceeded: boolean
  anyExceeded: boolean
}

export async function getSpendCapStatus(db: Db): Promise<AiSpendCapStatus> {
  const settings = await ensureAiProviderSettings(db)
  const dailyUsd = await getDailyUsageCost(db)
  const monthlyUsd = await getMonthlyUsageCost(db)
  const dailyCapUsd = settings.dailySpendCapUsd != null ? Number(settings.dailySpendCapUsd) : null
  const monthlyCapUsd = settings.monthlySpendCapUsd != null ? Number(settings.monthlySpendCapUsd) : null
  const dailyExceeded = dailyCapUsd != null && dailyUsd >= dailyCapUsd
  const monthlyExceeded = monthlyCapUsd != null && monthlyUsd >= monthlyCapUsd

  return {
    dailyUsd,
    monthlyUsd,
    dailyCapUsd,
    monthlyCapUsd,
    dailyExceeded,
    monthlyExceeded,
    anyExceeded: dailyExceeded || monthlyExceeded,
  }
}

/** Throws when daily or monthly spend cap would block a new AI call. */
export async function assertSpendCapAllowsRequest(db: Db): Promise<AiSpendCapStatus> {
  const status = await getSpendCapStatus(db)
  if (status.dailyExceeded && status.dailyCapUsd != null) {
    throw new AiSpendCapExceededError('daily', status.dailyCapUsd, status.dailyUsd)
  }
  if (status.monthlyExceeded && status.monthlyCapUsd != null) {
    throw new AiSpendCapExceededError('monthly', status.monthlyCapUsd, status.monthlyUsd)
  }
  return status
}

/** Rough USD estimate from token counts (OpenRouter billing varies by model). */
export function estimateTokenCostUsd(promptTokens: number, completionTokens: number): number {
  const total = promptTokens + completionTokens
  return Math.round(total * 0.000003 * 10000) / 10000
}
