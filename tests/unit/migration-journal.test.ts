import { describe, expect, it } from 'vitest'
import { readdirSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'

/**
 * A migration file that is missing from meta/_journal.json is never applied.
 * That silently shipped a schema without `users.silent_developer_mode`, which
 * broke every query against the users table on a fresh database.
 */
const MIGRATIONS_DIR = resolve('server/db/migrations')

/** Historical files intentionally left unregistered. */
const UNREGISTERED_BY_DESIGN = new Set([
  // Superseded by 0077, which is registered.
  '0058_silent_developer_mode',
  // Table is created at boot by ensure-document-change-requests-schema.mjs.
  '0054_document_change_requests',
  // One-time data backfill; re-running would rewrite invoice and estimate totals.
  '0055_remove_shop_fees',
])

describe('migration journal', () => {
  const files = readdirSync(MIGRATIONS_DIR)
    .filter(name => name.endsWith('.sql'))
    .map(name => name.replace(/\.sql$/, ''))
    .sort()

  const journal = JSON.parse(
    readFileSync(resolve(MIGRATIONS_DIR, 'meta/_journal.json'), 'utf8'),
  ) as { entries: Array<{ idx: number, tag: string, when: number }> }

  const tags = journal.entries.map(entry => entry.tag)

  it('registers every migration file that is meant to run', () => {
    const unregistered = files.filter(
      name => !tags.includes(name) && !UNREGISTERED_BY_DESIGN.has(name),
    )
    expect(unregistered).toEqual([])
  })

  it('has no journal entry without a matching file', () => {
    const missingFiles = tags.filter(tag => !files.includes(tag))
    expect(missingFiles).toEqual([])
  })

  it('keeps entries ordered so drizzle applies pending migrations', () => {
    const timestamps = journal.entries.map(entry => entry.when)
    const sorted = [...timestamps].sort((a, b) => a - b)
    expect(timestamps).toEqual(sorted)

    // Indexes have a historical gap (an unregistered file), so only the
    // ordering matters here.
    const indexes = journal.entries.map(entry => entry.idx)
    const ascending = indexes.every((value, i) => i === 0 || value > indexes[i - 1]!)
    expect(ascending).toBe(true)
  })

  it('creates the users column the schema depends on', () => {
    const sql = readFileSync(
      resolve(MIGRATIONS_DIR, '0077_silent_developer_mode_fix.sql'),
      'utf8',
    )
    expect(sql).toContain('silent_developer_mode')
    expect(sql).toContain('IF NOT EXISTS')
  })

  it('adds Susan SMS idle-timeout columns', () => {
    const sql = readFileSync(
      resolve(MIGRATIONS_DIR, '0080_susan_sms_idle_timeout.sql'),
      'utf8',
    )
    expect(sql).toContain('last_user_at')
    expect(sql).toContain('idle_closed_at')
    expect(sql).toContain('IF NOT EXISTS')
  })

  it('lets hard-delete keep service logs and messages by detaching the person', () => {
    const sql = readFileSync(
      resolve(MIGRATIONS_DIR, '0078_hard_delete_detach_submitter.sql'),
      'utf8',
    )
    expect(sql).toContain('service_logs')
    expect(sql).toContain('ALTER COLUMN "submitted_by" DROP NOT NULL')
    expect(sql).toContain('ON DELETE SET NULL')
    expect(sql).toContain('messages_sender_user_id_users_id_fk')
    expect(sql).toContain('staples_print_jobs')
  })
})
