import { afterEach, describe, expect, it, vi } from 'vitest'
import { openRouterAuthRecoveryMessage } from '../../shared/openrouter-auth'
import { openRouterChat } from '../../server/services/ai-openrouter.service'

describe('openRouterChat auth hardening', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  it('rejects blank keys with the operator recovery message', async () => {
    await expect(openRouterChat('   ', 'test-model', [
      { role: 'user', content: 'hi' },
    ], 'daily_summary')).rejects.toThrow(openRouterAuthRecoveryMessage())
  })

  it('sends a normalized Bearer Authorization header', async () => {
    const fetchMock = vi.fn(async (_url: string, init?: RequestInit) => {
      const headers = new Headers(init?.headers)
      expect(headers.get('Authorization')).toBe('Bearer sk-or-v1-abc')
      return new Response(JSON.stringify({
        choices: [{ message: { content: 'Note looks good today for the team.' } }],
        usage: { prompt_tokens: 1, completion_tokens: 2, total_tokens: 3, cost: 0.001 },
      }), { status: 200 })
    })
    vi.stubGlobal('fetch', fetchMock)

    const result = await openRouterChat('Bearer sk-or-v1-abc', 'test-model', [
      { role: 'user', content: 'hi' },
    ], 'daily_summary', { responseFormat: 'text' })

    expect(result.content).toContain('Note looks good')
    expect(fetchMock).toHaveBeenCalledOnce()
  })

  it('maps Missing Authentication header to the recovery message', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({
      error: { message: 'Missing Authentication header' },
    }), { status: 401 })))

    await expect(openRouterChat('sk-or-v1-abc', 'test-model', [
      { role: 'user', content: 'hi' },
    ], 'daily_summary')).rejects.toThrow(openRouterAuthRecoveryMessage())
  })
})
