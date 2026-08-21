import { beforeEach, describe, expect, it, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const isQuoSmsEnabled = vi.fn()
const sendQuoSmsDirect = vi.fn()

vi.mock('../../server/workers/lib/sms-notify.mjs', () => ({
  isQuoSmsEnabled: (...args: unknown[]) => isQuoSmsEnabled(...args),
  sendQuoSmsDirect: (...args: unknown[]) => sendQuoSmsDirect(...args),
}))

describe('processSusanSmsIdleTimeouts', () => {
  beforeEach(() => {
    vi.resetModules()
    isQuoSmsEnabled.mockReset()
    sendQuoSmsDirect.mockReset()
  })

  it('does not touch threads when Quo is off', async () => {
    isQuoSmsEnabled.mockResolvedValue(false)
    const { processSusanSmsIdleTimeouts } = await import('../../server/workers/handlers/susan-sms-idle.mjs')
    const pool = { connect: vi.fn(), query: vi.fn() }
    await expect(processSusanSmsIdleTimeouts(pool as never)).resolves.toEqual({ processed: 0, failed: 0 })
    expect(pool.connect).not.toHaveBeenCalled()
    expect(sendQuoSmsDirect).not.toHaveBeenCalled()
  })

  it('skips threads that are already closed or still inside the 5-minute window', async () => {
    isQuoSmsEnabled.mockResolvedValue(true)
    const release = vi.fn()
    const clientQuery = vi.fn()
      .mockResolvedValueOnce(undefined) // BEGIN
      .mockResolvedValueOnce({ rows: [] }) // SELECT none eligible
      .mockResolvedValueOnce(undefined) // COMMIT

    const pool = {
      connect: vi.fn(async () => ({ query: clientQuery, release })),
      query: vi.fn(),
    }

    const { processSusanSmsIdleTimeouts } = await import('../../server/workers/handlers/susan-sms-idle.mjs')
    const result = await processSusanSmsIdleTimeouts(pool as never, 1)

    expect(result).toEqual({ processed: 0, failed: 0 })
    expect(sendQuoSmsDirect).not.toHaveBeenCalled()
    expect(String(clientQuery.mock.calls[1]?.[0])).toContain('idle_closed_at IS NULL')
    expect(String(clientQuery.mock.calls[1]?.[0])).toContain('last_user_at <= now()')
    expect(clientQuery.mock.calls[1]?.[1]?.[0]).toBe(300)
  })

  it('closes an idle chat, clears pending, and sends the timeout SMS', async () => {
    isQuoSmsEnabled.mockResolvedValue(true)
    sendQuoSmsDirect.mockResolvedValue(true)
    const release = vi.fn()
    const clientQuery = vi.fn()
      .mockResolvedValueOnce(undefined) // BEGIN
      .mockResolvedValueOnce({
        rows: [{
          id: 'thread-1',
          phone: '+15551234567',
          messages: [
            { role: 'user', content: 'INV-000658', at: '2026-08-20T16:00:00.000Z' },
            { role: 'assistant', content: 'Here is INV-000658', at: '2026-08-20T16:00:01.000Z' },
          ],
          pending_action: {
            kind: 'wizard',
            action: 'lookup_invoice',
            step: 'await_query',
            data: { query: 'INV-000658' },
            startedAt: '2026-08-20T16:00:00.000Z',
          },
        }],
      })
      .mockResolvedValueOnce(undefined) // UPDATE
      .mockResolvedValueOnce(undefined) // COMMIT
      .mockResolvedValueOnce(undefined) // BEGIN loop 2
      .mockResolvedValueOnce({ rows: [] }) // none left
      .mockResolvedValueOnce(undefined) // COMMIT

    const pool = {
      connect: vi.fn(async () => ({ query: clientQuery, release })),
      query: vi.fn(),
    }

    const { processSusanSmsIdleTimeouts } = await import('../../server/workers/handlers/susan-sms-idle.mjs')
    const result = await processSusanSmsIdleTimeouts(pool as never, 2)

    expect(result).toEqual({ processed: 1, failed: 0 })
    const updateSql = String(clientQuery.mock.calls[2]?.[0])
    expect(updateSql).toContain('idle_closed_at = now()')
    expect(updateSql).toContain('pending_action = NULL')
    const savedMessages = JSON.parse(String(clientQuery.mock.calls[2]?.[1]?.[1])) as Array<{ role: string, content: string }>
    expect(savedMessages.at(-1)?.role).toBe('assistant')
    expect(savedMessages.at(-1)?.content).toContain('looking up INV-000658')
    expect(savedMessages.at(-1)?.content).toContain('timed out after 5 minutes')
    expect(sendQuoSmsDirect).toHaveBeenCalledWith(pool, {
      to: '+15551234567',
      body: expect.stringContaining('Glad I could help with looking up INV-000658.'),
    })
  })
})

describe('Susan SMS idle timeout wiring', () => {
  it('runs from the dedicated worker tick next to sms_send, not when skipSms is set', () => {
    const tick = readFileSync(resolve('server/lib/general-worker-tick.mjs'), 'utf8')
    expect(tick).toContain('processSusanSmsIdleTimeouts')
    expect(tick).toMatch(/if \(!opts\.skipSms\) \{[\s\S]*processSusanSmsIdleTimeouts/)
  })

  it('resets the idle clock on a real reply and closes on carrier keywords', () => {
    const src = readFileSync(resolve('server/services/susan-sms.service.ts'), 'utf8')
    expect(src).toContain("idleKind: 'user_reply'")
    expect(src).toContain("idleKind: 'carrier'")
    expect(src).toContain('susanSmsIdleThreadPatch')
  })
})
