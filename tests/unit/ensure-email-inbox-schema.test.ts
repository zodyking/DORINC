import { describe, expect, it, vi } from 'vitest'
import { ensureEmailInboxSchema } from '../../server/lib/ensure-email-inbox-schema.mjs'

describe('ensureEmailInboxSchema', () => {
  it('skips repair when email_threads already exists', async () => {
    const query = vi.fn().mockResolvedValue({ rows: [{ reg: 'email_threads' }] })
    const pool = { query }

    await expect(ensureEmailInboxSchema(pool)).resolves.toBe(false)
    expect(query).toHaveBeenCalledTimes(1)
  })

  it('applies inline SQL when tables are missing and migration file is unavailable', async () => {
    const query = vi.fn()
      .mockResolvedValueOnce({ rows: [{ reg: null }] })
      .mockResolvedValueOnce(undefined)
    const pool = { query }

    await expect(ensureEmailInboxSchema(pool)).resolves.toBe(true)
    expect(query).toHaveBeenCalledTimes(2)
    expect(String(query.mock.calls[1]?.[0])).toContain('CREATE TABLE IF NOT EXISTS "email_threads"')
  })
})
