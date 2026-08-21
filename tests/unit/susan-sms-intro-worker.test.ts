import { beforeEach, describe, expect, it, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const isQuoSmsEnabled = vi.fn()
const sendQuoSmsDirect = vi.fn()

vi.mock('../../server/workers/lib/sms-notify.mjs', () => ({
  isQuoSmsEnabled: (...args: unknown[]) => isQuoSmsEnabled(...args),
  sendQuoSmsDirect: (...args: unknown[]) => sendQuoSmsDirect(...args),
  normalizePhoneE164: (value: unknown) => {
    const digits = String(value ?? '').replace(/\D/g, '')
    if (digits.length === 11 && digits.startsWith('1')) return `+${digits}`
    if (digits.length === 10) return `+1${digits}`
    if (String(value ?? '').startsWith('+')) return String(value)
    return null
  },
}))

describe('processSusanSmsIntros', () => {
  beforeEach(() => {
    vi.resetModules()
    isQuoSmsEnabled.mockReset()
    sendQuoSmsDirect.mockReset()
  })

  it('does not touch users when Quo is off', async () => {
    isQuoSmsEnabled.mockResolvedValue(false)
    const { processSusanSmsIntros } = await import('../../server/workers/handlers/susan-sms-intro.mjs')
    const pool = { connect: vi.fn(), query: vi.fn() }
    await expect(processSusanSmsIntros(pool as never)).resolves.toEqual({ processed: 0, failed: 0 })
    expect(pool.connect).not.toHaveBeenCalled()
    expect(sendQuoSmsDirect).not.toHaveBeenCalled()
  })

  it('skips staff who texted in the last 72 hours', async () => {
    isQuoSmsEnabled.mockResolvedValue(true)
    const release = vi.fn()
    const clientQuery = vi.fn()
      .mockResolvedValueOnce(undefined) // BEGIN
      .mockResolvedValueOnce({ rows: [] }) // no due existing thread
      .mockResolvedValueOnce({ rows: [] }) // no user without a thread
      .mockResolvedValueOnce(undefined) // COMMIT

    const pool = {
      connect: vi.fn(async () => ({ query: clientQuery, release })),
      query: vi.fn(),
    }

    const { processSusanSmsIntros } = await import('../../server/workers/handlers/susan-sms-intro.mjs')
    const result = await processSusanSmsIntros(pool as never, 1)

    expect(result).toEqual({ processed: 0, failed: 0 })
    expect(sendQuoSmsDirect).not.toHaveBeenCalled()
    expect(String(clientQuery.mock.calls[1]?.[0])).toContain('last_user_at <= now()')
    expect(clientQuery.mock.calls[1]?.[1]?.[0]).toBe(72 * 60 * 60)
  })

  it('sends the how-to to a due thread and records last_intro_at', async () => {
    isQuoSmsEnabled.mockResolvedValue(true)
    sendQuoSmsDirect.mockResolvedValue(true)
    const release = vi.fn()
    const clientQuery = vi.fn()
      .mockResolvedValueOnce(undefined) // BEGIN
      .mockResolvedValueOnce({
        rows: [{
          id: 'thread-1',
          user_id: 'user-1',
          phone: '+15551234567',
          user_phone: '+15551234567',
          messages: [],
          last_user_at: new Date('2026-08-18T00:00:00.000Z'),
          last_intro_at: new Date('2026-08-18T00:00:00.000Z'),
          idle_closed_at: new Date('2026-08-18T00:05:00.000Z'),
          opted_out_at: null,
        }],
      })
      .mockResolvedValueOnce(undefined) // UPDATE
      .mockResolvedValueOnce(undefined) // COMMIT

    const pool = {
      connect: vi.fn(async () => ({ query: clientQuery, release })),
      query: vi.fn(),
    }

    const { processSusanSmsIntros } = await import('../../server/workers/handlers/susan-sms-intro.mjs')
    const result = await processSusanSmsIntros(pool as never, 1)

    expect(result).toEqual({ processed: 1, failed: 0 })
    expect(String(clientQuery.mock.calls[2]?.[0])).toContain('last_intro_at = now()')
    expect(sendQuoSmsDirect).toHaveBeenCalledWith(pool, {
      to: '+15551234567',
      body: expect.stringContaining(`Hey — I'm Susan, your AI assistant.`),
    })
    expect(sendQuoSmsDirect.mock.calls[0]?.[1]?.body).toContain('text Menu for commands')
  })
})

describe('Susan SMS how-to wiring', () => {
  it('runs from the dedicated worker tick after idle timeouts', () => {
    const tick = readFileSync(resolve('server/lib/general-worker-tick.mjs'), 'utf8')
    expect(tick).toContain('processSusanSmsIntros')
    expect(tick).toMatch(/if \(!opts\.skipSms\) \{[\s\S]*processSusanSmsIdleTimeouts[\s\S]*processSusanSmsIntros/)
  })
})
