import { describe, expect, it, vi } from 'vitest'
import { ensureEmailInboxSchema } from '../../server/lib/ensure-email-inbox-schema.mjs'

describe('ensureEmailInboxSchema', () => {
  it('skips repair when email_threads already exists', async () => {
    const query = vi.fn().mockResolvedValue({ rows: [{ reg: 'email_threads' }] })
    const pool = { query }

    await expect(ensureEmailInboxSchema(pool)).resolves.toBe(false)
    expect(query).toHaveBeenCalledTimes(1)
  })
})
