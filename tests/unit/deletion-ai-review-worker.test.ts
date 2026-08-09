import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'

describe('processDeletionAiReviewJobs', () => {
  const originalEnv = { ...process.env }

  beforeEach(() => {
    vi.resetModules()
    process.env = { ...originalEnv }
  })

  afterEach(() => {
    process.env = { ...originalEnv }
    vi.restoreAllMocks()
  })

  it('skips when no worker token is configured', async () => {
    delete process.env.INTERNAL_WORKER_TOKEN
    delete process.env.ENCRYPTION_MASTER_KEY
    const { processDeletionAiReviewJobs } = await import('../../server/workers/handlers/deletion-ai-review.mjs')
    const pool = { connect: vi.fn(), query: vi.fn() }
    const result = await processDeletionAiReviewJobs(pool as never)
    expect(result).toEqual({ processed: 0, failed: 0, skipped: true })
    expect(pool.connect).not.toHaveBeenCalled()
  })

  it('claims a due job and marks it done after a successful review API call', async () => {
    process.env.INTERNAL_WORKER_TOKEN = 'test-token'
    process.env.APP_URL = 'http://review.test'
    const release = vi.fn()
    const clientQuery = vi.fn()
      .mockResolvedValueOnce(undefined) // BEGIN
      .mockResolvedValueOnce({
        rows: [{
          id: 'job-1',
          payload: { requestId: '11111111-1111-1111-1111-111111111111' },
          attempts: 0,
          max_attempts: 3,
        }],
      })
      .mockResolvedValueOnce(undefined) // UPDATE processing
      .mockResolvedValueOnce(undefined) // COMMIT

    const pool = {
      connect: vi.fn(async () => ({ query: clientQuery, release })),
      query: vi.fn(async () => ({ rows: [] })),
    }

    const fetchMock = vi.fn(async () => ({
      ok: true,
      json: async () => ({ ok: true, decision: 'reject', note: 'Edit instead' }),
    }))
    vi.stubGlobal('fetch', fetchMock)

    const { processDeletionAiReviewJobs } = await import('../../server/workers/handlers/deletion-ai-review.mjs')
    const result = await processDeletionAiReviewJobs(pool as never, 1)

    expect(result.processed).toBe(1)
    expect(result.failed).toBe(0)
    expect(fetchMock).toHaveBeenCalledWith(
      'http://review.test/api/internal/ai-administrator/review',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({ 'x-worker-token': 'test-token' }),
      }),
    )
    expect(pool.query).toHaveBeenCalledWith(
      expect.stringContaining("status = 'done'"),
      ['job-1'],
    )
  })
})
