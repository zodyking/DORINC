import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it, vi } from 'vitest'

describe('scrubDeletedUserIdentity', () => {
  const source = readFileSync(resolve('server/lib/scrub-deleted-user-identity.mjs'), 'utf8')
  const runtime = readFileSync(resolve('server/db/migrate-runtime.ts'), 'utf8')

  it('runs on web boot after access-gate tables exist', () => {
    expect(runtime).toContain('scrubDeletedUserIdentity')
    expect(runtime.indexOf('ensureAccessGateSchema')).toBeLessThan(
      runtime.indexOf('scrubDeletedUserIdentity'),
    )
    expect(runtime.indexOf('ensureOutsideGeoSchema')).toBeLessThan(
      runtime.indexOf('scrubDeletedUserIdentity'),
    )
  })

  it('only removes presence for user ids that no longer exist', () => {
    expect(source).toContain('NOT EXISTS (SELECT 1 FROM users u WHERE u.id = access_events.user_id)')
    expect(source).toContain('NOT EXISTS (SELECT 1 FROM users u WHERE u.id = ae.user_id)')
    expect(source).toContain('NOT EXISTS (SELECT 1 FROM users u WHERE u.id = og.user_id)')
    expect(source).toContain('orphan_deleted_user_devices')
  })

  it('does not wipe a shared phone still used by a living user', () => {
    expect(source).toContain('FROM sessions s')
    expect(source).toContain('living.user_id IS NOT NULL')
    expect(source).toContain('EXISTS (SELECT 1 FROM users u WHERE u.id = living.user_id)')
  })

  it('keeps a recreated account that reused the same email', () => {
    expect(source).toContain('lower(u.email) = lower(btrim(ae.user_email))')
  })

  it('skips when presence tables are missing and rolls back on failure', async () => {
    const { scrubDeletedUserIdentity } = await import('../../server/lib/scrub-deleted-user-identity.mjs')
    const query = vi.fn()
      .mockResolvedValueOnce({ rows: [{ reg: null }] })
      .mockResolvedValueOnce({ rows: [{ reg: null }] })
      .mockResolvedValueOnce({ rows: [{ reg: null }] })
    const pool = { query, connect: vi.fn() }

    await expect(scrubDeletedUserIdentity(pool)).resolves.toBeUndefined()
    expect(pool.connect).not.toHaveBeenCalled()
  })

  it('scrubs orphaned access events when the table exists', async () => {
    const { scrubDeletedUserIdentity } = await import('../../server/lib/scrub-deleted-user-identity.mjs')
    const clientQuery = vi.fn().mockResolvedValue({ rows: [] })
    const client = { query: clientQuery, release: vi.fn() }
    const query = vi.fn()
      .mockResolvedValueOnce({ rows: [{ reg: 'access_events' }] })
      .mockResolvedValueOnce({ rows: [{ reg: null }] })
      .mockResolvedValueOnce({ rows: [{ reg: null }] })
    const pool = { query, connect: vi.fn().mockResolvedValue(client) }

    await scrubDeletedUserIdentity(pool)
    expect(clientQuery.mock.calls.some(call => String(call[0]).includes('BEGIN'))).toBe(true)
    expect(clientQuery.mock.calls.some(call => String(call[0]).includes('DELETE FROM access_events'))).toBe(true)
    expect(clientQuery.mock.calls.some(call => String(call[0]).includes('COMMIT'))).toBe(true)
    expect(client.release).toHaveBeenCalled()
  })
})
