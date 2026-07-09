// Integration tests for platform help + spend caps (P2-15 / P2-16).
import { config } from 'dotenv'
import { eq } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/node-postgres'
import { Pool } from 'pg'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { aiProviderSettings, aiUsageLogs } from '../../server/db/schema/ai'
import { users } from '../../server/db/schema/auth'
import { listAiUsageLogs } from '../../server/services/ai-jobs.service'
import {
  AiSpendCapExceededError,
  assertSpendCapAllowsRequest,
  getSpendCapStatus,
  updateAiProviderSettings,
} from '../../server/services/ai-provider.service'
import { askPlatformHelp, getPlatformHelpStatus } from '../../server/services/platform-help.service'

config()

const pool = new Pool({ connectionString: process.env.DATABASE_URL })
const db = drizzle({ client: pool })

const stamp = Date.now()
const encryptionKey = process.env.ENCRYPTION_MASTER_KEY ?? `test-help-key-${stamp}`
const createdUsageIds: string[] = []

let actorId = ''

beforeAll(async () => {
  process.env.ENCRYPTION_MASTER_KEY = encryptionKey
  const [actor] = await db.select({ id: users.id }).from(users).limit(1)
  actorId = actor!.id

  await updateAiProviderSettings(db, {
    enabled: true,
    platformHelpEnabled: true,
    apiKey: `sk-or-test-${stamp}`,
    dailySpendCapUsd: 0,
    monthlySpendCapUsd: 100,
  }, actorId)
})

afterAll(async () => {
  if (createdUsageIds.length) {
    for (const id of createdUsageIds) {
      await db.delete(aiUsageLogs).where(eq(aiUsageLogs.id, id))
    }
  }
  await db.update(aiProviderSettings).set({
    encryptedApiKey: null,
    enabled: false,
    dailySpendCapUsd: null,
    monthlySpendCapUsd: null,
    updatedAt: new Date(),
  })
  await pool.end()
})

describe.sequential('P2-15 platform help assistant', () => {
  it('returns keyword fallback without calling OpenRouter when capped', async () => {
    const status = await getPlatformHelpStatus(db)
    expect(status.enabled).toBe(true)

    const result = await askPlatformHelp(db, {
      question: 'How do I create a new invoice?',
      pageContext: 'Dashboard',
      userId: actorId,
    })

    expect(result.source).toBe('fallback')
    expect(result.answer).toContain('New Invoice')
    expect(result.capped).toBe(true)
  })

  it('uses OpenRouter when under spend cap (mocked)', async () => {
    await updateAiProviderSettings(db, { dailySpendCapUsd: 50 }, actorId)

    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      json: async () => ({
        choices: [{ message: { content: 'Use <b>Billing tools → New Invoice</b>.' } }],
        usage: { prompt_tokens: 50, completion_tokens: 30 },
      }),
    } as Response)

    const result = await askPlatformHelp(db, {
      question: 'How do I start billing?',
      userId: actorId,
    })

    expect(result.source).toBe('ai')
    expect(result.answer).toContain('New Invoice')
    expect(fetchMock).toHaveBeenCalled()

    const logs = await listAiUsageLogs(db, { limit: 5, offset: 0 })
    const helpLog = logs.items.find(i => i.featureType === 'platform_help')
    expect(helpLog).toBeDefined()
    if (helpLog) createdUsageIds.push(helpLog.id)

    fetchMock.mockRestore()
    await updateAiProviderSettings(db, { dailySpendCapUsd: 0 }, actorId)
  })
})

describe.sequential('P2-16 AI usage logs + spend caps', () => {
  it('reports daily and monthly spend status', async () => {
    const status = await getSpendCapStatus(db)
    expect(status.dailyCapUsd).toBe(0)
    expect(status.monthlyCapUsd).toBe(100)
    expect(status.dailyExceeded).toBe(true)
  })

  it('blocks AI requests when daily cap exceeded', async () => {
    await expect(assertSpendCapAllowsRequest(db)).rejects.toBeInstanceOf(AiSpendCapExceededError)
  })

  it('lists usage logs for admin', async () => {
    const { items, total } = await listAiUsageLogs(db, { limit: 10, offset: 0 })
    expect(total).toBeGreaterThanOrEqual(items.length)
    for (const item of items) {
      expect(item.estimatedCostUsd).toBeGreaterThanOrEqual(0)
      expect(item.model).toBeTruthy()
    }
  })
})
