import { describe, expect, it, vi, afterEach } from 'vitest'
import { fetchOpenRouterKeyUsage } from '../../server/services/openrouter-billing.service'
import { openRouterAuthRecoveryMessage } from '../../shared/openrouter-auth'

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

  it('normalizes Bearer-prefixed keys before calling OpenRouter', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ data: { usage: 1, is_management_key: false } }),
    })
    vi.stubGlobal('fetch', fetchMock)

    await fetchOpenRouterKeyUsage('Bearer sk-or-v1-abc')

    expect(fetchMock).toHaveBeenCalledWith(
      'https://openrouter.ai/api/v1/key',
      expect.objectContaining({
        headers: expect.objectContaining({
          Authorization: 'Bearer sk-or-v1-abc',
        }),
      }),
    )
  })

  it('maps Missing Authentication header to a recovery message', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: false,
      status: 401,
      json: async () => ({ error: { message: 'Missing Authentication header' } }),
    }))

    await expect(fetchOpenRouterKeyUsage('sk-test')).rejects.toThrow(openRouterAuthRecoveryMessage())
  })

  it('rejects empty keys before calling OpenRouter', async () => {
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)

    await expect(fetchOpenRouterKeyUsage('   ')).rejects.toThrow(openRouterAuthRecoveryMessage())
    expect(fetchMock).not.toHaveBeenCalled()
  })
})
