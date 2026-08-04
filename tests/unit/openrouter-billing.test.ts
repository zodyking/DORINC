import { describe, expect, it, vi, afterEach } from 'vitest'
import { fetchOpenRouterKeyUsage } from '../../server/services/openrouter-billing.service'

describe('fetchOpenRouterKeyUsage', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('maps current OpenRouter /key response fields', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        data: {
          usage: 25.5,
          usage_daily: 1.25,
          usage_monthly: 18.2,
          limit: 100,
          limit_remaining: 74.5,
          is_management_key: false,
        },
      }),
    }))

    await expect(fetchOpenRouterKeyUsage('sk-test')).resolves.toEqual({
      usage: 25.5,
      usageDaily: 1.25,
      usageMonthly: 18.2,
      limit: 100,
      limitRemaining: 74.5,
      isManagementKey: false,
    })
  })
})
