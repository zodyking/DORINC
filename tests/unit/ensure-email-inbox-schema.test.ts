import { describe, expect, it, vi } from 'vitest'
import { ensureEmailInboxSchema } from '../../server/lib/ensure-email-inbox-schema.mjs'

describe('ensureEmailInboxSchema', () => {
  it('skips repair when email tables and suppression tombstones exist', async () => {
    const query = vi.fn()
      .mockResolvedValueOnce({ rows: [{ reg: 'email_threads' }] })
      .mockResolvedValueOnce({ rows: [{ reg: 'email_ingest_suppressions' }] })
    const pool = { query }

    await expect(ensureEmailInboxSchema(pool)).resolves.toBe(false)
    expect(query).toHaveBeenCalledTimes(2)
  })

  it('applies inbox and suppression migrations when tables are missing', async () => {
    const query = vi.fn()
      .mockResolvedValueOnce({ rows: [{ reg: null }] })
      .mockResolvedValueOnce(undefined)
      .mockResolvedValueOnce({ rows: [{ reg: null }] })
      .mockResolvedValueOnce(undefined)
    const pool = { query }

    await expect(ensureEmailInboxSchema(pool)).resolves.toBe(true)
    expect(query).toHaveBeenCalledTimes(4)
    expect(String(query.mock.calls[1]?.[0])).toContain('CREATE TABLE IF NOT EXISTS "email_threads"')
    expect(String(query.mock.calls[3]?.[0])).toContain('CREATE TABLE IF NOT EXISTS "email_ingest_suppressions"')
  })
})
