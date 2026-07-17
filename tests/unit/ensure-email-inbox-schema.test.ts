import { describe, expect, it, vi } from 'vitest'
import { ensureEmailInboxSchema } from '../../server/lib/ensure-email-inbox-schema.mjs'

describe('ensureEmailInboxSchema', () => {
  it('skips repair when email tables and suppression tombstones exist', async () => {
    const query = vi.fn()
      .mockResolvedValueOnce({ rows: [{ reg: 'email_threads' }] })
      .mockResolvedValueOnce({ rows: [{ reg: 'email_ingest_suppressions' }] })
      .mockResolvedValueOnce({ rows: [{ '1': 1 }] })
      .mockResolvedValueOnce({ rows: [{ '1': 1 }] })
      .mockResolvedValueOnce({ rows: [{ '1': 1 }] })
    const pool = { query }

    await expect(ensureEmailInboxSchema(pool)).resolves.toBe(false)
    expect(query).toHaveBeenCalledTimes(5)
  })

  it('applies inbox and suppression migrations when tables are missing', async () => {
    const query = vi.fn()
      .mockResolvedValueOnce({ rows: [{ reg: null }] })
      .mockResolvedValueOnce(undefined)
      .mockResolvedValueOnce({ rows: [{ reg: null }] })
      .mockResolvedValueOnce(undefined)
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce(undefined)
      .mockResolvedValueOnce({ rows: [{ '1': 1 }] })
      .mockResolvedValueOnce({ rows: [{ '1': 1 }] })
    const pool = { query }

    await expect(ensureEmailInboxSchema(pool)).resolves.toBe(true)
    expect(query).toHaveBeenCalledTimes(8)
    expect(String(query.mock.calls[1]?.[0])).toContain('CREATE TABLE IF NOT EXISTS "email_threads"')
    expect(String(query.mock.calls[3]?.[0])).toContain('CREATE TABLE IF NOT EXISTS "email_ingest_suppressions"')
    expect(String(query.mock.calls[5]?.[0])).toContain('content_id')
  })

  it('applies team group chat migration when user columns are missing', async () => {
    const query = vi.fn()
      .mockResolvedValueOnce({ rows: [{ reg: 'email_threads' }] })
      .mockResolvedValueOnce({ rows: [{ reg: 'email_ingest_suppressions' }] })
      .mockResolvedValueOnce({ rows: [{ '1': 1 }] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce(undefined)
      .mockResolvedValueOnce({ rows: [{ '1': 1 }] })
    const pool = { query }

    await expect(ensureEmailInboxSchema(pool)).resolves.toBe(true)
    expect(String(query.mock.calls[4]?.[0])).toContain('team_chat_enabled')
  })
})
