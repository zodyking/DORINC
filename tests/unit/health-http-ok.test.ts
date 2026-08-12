import { describe, expect, it } from 'vitest'
import { healthHttpOk } from '../../shared/health-http'

describe('healthHttpOk', () => {
  it('stays live when workers are unknown (fresh deploy / stale heartbeat)', () => {
    const result = healthHttpOk({
      database: 'ok',
      workers: { pdf: 'unknown', queue: 'idle' },
    })
    expect(result.live).toBe(true)
    expect(result.ok).toBe(false)
  })

  it('stays live when pdf worker is error', () => {
    const result = healthHttpOk({
      database: 'ok',
      workers: { pdf: 'error', queue: 'healthy' },
    })
    expect(result.live).toBe(true)
    expect(result.ok).toBe(false)
  })

  it('is fully ok when database and workers are healthy', () => {
    const result = healthHttpOk({
      database: 'ok',
      workers: { pdf: 'idle', queue: 'idle' },
    })
    expect(result.live).toBe(true)
    expect(result.ok).toBe(true)
  })

  it('is not live when database probe failed', () => {
    const result = healthHttpOk({
      database: 'error',
      workers: { pdf: 'idle', queue: 'idle' },
    })
    expect(result.live).toBe(false)
    expect(result.ok).toBe(false)
  })
})
