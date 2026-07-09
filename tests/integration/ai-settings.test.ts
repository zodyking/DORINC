// Integration tests for AI settings + jobs schema (P2-11 / P2-12).
import { config } from 'dotenv'
import { eq } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/node-postgres'
import { Pool } from 'pg'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { aiJobs, aiProviderSettings, aiSuggestions, aiUsageLogs } from '../../server/db/schema/ai'
import { auditLogs } from '../../server/db/schema/audit'
import { users } from '../../server/db/schema/auth'
import {
  createAiJob,
  createAiSuggestion,
  getAiUsageSummary,
  logAiUsage,
} from '../../server/services/ai-jobs.service'
import {
  getAiHealth,
  getAiProviderSettings,
  getDecryptedApiKey,
  getSpendCapStatus,
  testOpenRouterConnection,
  updateAiProviderSettings,
} from '../../server/services/ai-provider.service'
import { decryptBuffer } from '../../server/services/encryption.service'
import { ACCOUNT_TYPE_BUNDLES } from '../../shared/permissions/keys'

config()

const pool = new Pool({ connectionString: process.env.DATABASE_URL })
const db = drizzle({ client: pool })

const stamp = Date.now()
const testKey = `sk-or-test-${stamp}`
const encryptionKey = process.env.ENCRYPTION_MASTER_KEY ?? `test-ai-key-${stamp}`

let actorId = ''
const createdJobIds: string[] = []
const createdSuggestionIds: string[] = []
const createdUsageIds: string[] = []

beforeAll(async () => {
  process.env.ENCRYPTION_MASTER_KEY = encryptionKey
  const [actor] = await db.select({ id: users.id }).from(users).limit(1)
  actorId = actor!.id
})

afterAll(async () => {
  if (createdUsageIds.length) {
    for (const id of createdUsageIds) {
      await db.delete(aiUsageLogs).where(eq(aiUsageLogs.id, id))
    }
  }
  if (createdSuggestionIds.length) {
    for (const id of createdSuggestionIds) {
      await db.delete(aiSuggestions).where(eq(aiSuggestions.id, id))
    }
  }
  if (createdJobIds.length) {
    for (const id of createdJobIds) {
      await db.delete(aiJobs).where(eq(aiJobs.id, id))
    }
  }
  await db.delete(auditLogs).where(eq(auditLogs.entityType, 'ai_settings'))
  await db.update(aiProviderSettings).set({
    encryptedApiKey: null,
    enabled: false,
    updatedAt: new Date(),
  })
  await pool.end()
})

describe('P2-11 AI provider settings', () => {
  it('grants ai.admin.all to super_admin and admin', () => {
    const withAiAdmin = Object.entries(ACCOUNT_TYPE_BUNDLES)
      .filter(([, bundle]) => bundle.includes('ai.admin.all'))
      .map(([type]) => type)
    expect(withAiAdmin).toEqual(['super_admin', 'admin'])
  })

  it('stores encrypted API key and never exposes it in settings view', async () => {
    const updated = await updateAiProviderSettings(db, {
      apiKey: testKey,
      enabled: true,
      defaultModel: 'anthropic/claude-3.5-sonnet',
    }, actorId)

    expect(updated.hasApiKey).toBe(true)
    expect(updated).not.toHaveProperty('apiKey')
    expect(updated).not.toHaveProperty('encryptedApiKey')

    const [row] = await db.select().from(aiProviderSettings).where(eq(aiProviderSettings.id, updated.id))
    expect(row?.encryptedApiKey).toBeTruthy()
    expect(row!.encryptedApiKey!.toString('utf8')).not.toContain(testKey)

    const decrypted = await getDecryptedApiKey(db)
    expect(decrypted).toBe(testKey)

    const plain = decryptBuffer(row!.encryptedApiKey!)
    expect(plain.toString('utf8')).toBe(testKey)
  })

  it('reports AI health from settings state', async () => {
    const health = await getAiHealth(db)
    expect(health.hasApiKey).toBe(true)
    expect(health.status).toBe('active')
    expect(health.provider).toBe('openrouter')
  })

  it('verifies OpenRouter via test connection (mocked)', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      json: async () => ({ data: [{ id: 'm1' }, { id: 'm2' }] }),
    } as Response)

    const result = await testOpenRouterConnection(testKey)
    expect(result.ok).toBe(true)
    expect(result.modelCount).toBe(2)

    fetchMock.mockRestore()
  })

  it('returns default settings row when none exists yet', async () => {
    const settings = await getAiProviderSettings(db)
    expect(settings.provider).toBe('openrouter')
    expect(settings.defaultModel).toBeTruthy()
  })
})

describe('P2-12 AI jobs + suggestions + usage logs', () => {
  it('creates ai_jobs, ai_suggestions, and ai_usage_logs rows', async () => {
    const entityId = crypto.randomUUID()
    const job = await createAiJob(db, {
      jobType: 'service_log_extraction',
      entityType: 'service_log',
      entityId,
      inputPayload: { fileIds: ['f1'] },
      createdBy: actorId,
    })
    createdJobIds.push(job.id)
    expect(job.status).toBe('queued')
    expect(job.jobType).toBe('service_log_extraction')

    const suggestion = await createAiSuggestion(db, {
      aiJobId: job.id,
      featureType: 'service_log_extraction',
      entityType: 'service_log',
      entityId,
      originalContent: { notes: 'oil leak' },
      suggestedContent: { fields: { issue: 'Oil leak at pan gasket' } },
    })
    createdSuggestionIds.push(suggestion.id)
    expect(suggestion.status).toBe('pending')

    const usage = await logAiUsage(db, {
      aiJobId: job.id,
      featureType: 'service_log_extraction',
      model: 'anthropic/claude-3.5-sonnet',
      promptTokens: 120,
      completionTokens: 45,
      estimatedCostUsd: 0.0021,
      createdBy: actorId,
    })
    createdUsageIds.push(usage.id)

    const summary = await getAiUsageSummary(db)
    expect(summary.totalRuns).toBeGreaterThan(0)
    expect(summary.byFeature.service_log_extraction).toBeGreaterThan(0)
    expect(summary.estimatedCostUsd).toBeGreaterThan(0)
    expect(summary.dailyCostUsd).toBeGreaterThanOrEqual(0)
  })

  it('tracks spend cap settings', async () => {
    await updateAiProviderSettings(db, {
      dailySpendCapUsd: 5,
      monthlySpendCapUsd: 50,
    }, actorId)

    const caps = await getSpendCapStatus(db)
    expect(caps.dailyCapUsd).toBe(5)
    expect(caps.monthlyCapUsd).toBe(50)
    expect(typeof caps.dailyUsd).toBe('number')
    expect(typeof caps.monthlyUsd).toBe('number')
  })
})
