import { describe, expect, it, vi } from 'vitest'
import { FetchHardTimeoutError, fetchJsonWithHardTimeout } from '../../app/utils/fetch-json-hard-timeout'

describe('fetchJsonWithHardTimeout', () => {
  it('returns parsed JSON on success', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ settings: { id: 'abc' } }),
    }))

    const result = await fetchJsonWithHardTimeout<{ settings: { id: string } }>('/api/test', {
      method: 'PATCH',
      body: { ok: true },
      timeoutMs: 5_000,
    })

    expect(result.settings.id).toBe('abc')
    vi.unstubAllGlobals()
  })

  it('throws FetchHardTimeoutError when the request is aborted by timeout', async () => {
    vi.stubGlobal('fetch', vi.fn((_url, init?: RequestInit) => new Promise((_resolve, reject) => {
      init?.signal?.addEventListener('abort', () => {
        reject(Object.assign(new Error('Aborted'), { name: 'AbortError' }))
      })
    })))

    await expect(fetchJsonWithHardTimeout('/api/test', { timeoutMs: 20 }))
      .rejects
      .toBeInstanceOf(FetchHardTimeoutError)

    vi.unstubAllGlobals()
  })
})
