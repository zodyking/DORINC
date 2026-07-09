// Integration tests for API rate limiting (P2-20).
import { config } from 'dotenv'
import { and, eq, like } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/node-postgres'
import { Pool } from 'pg'
import { afterAll, describe, expect, it } from 'vitest'
import { rateLimitEvents } from '../../server/db/schema/rate-limits'
import {
  consumeRateLimit,
  countRateLimitEvents,
  RateLimitError,
} from '../../server/services/rate-limit.service'

config()

const pool = new Pool({ connectionString: process.env.DATABASE_URL })
const db = drizzle({ client: pool })

const stamp = Date.now()
const testKey = `rate-test-${stamp}`

afterAll(async () => {
  await db.delete(rateLimitEvents).where(like(rateLimitEvents.key, `rate-test-${stamp}%`))
  await pool.end()
})

describe('P2-20 rate limiting', () => {
  it('allows requests under the configured limit', async () => {
    const policy = { maxAttempts: 3, windowMs: 60_000 }
    for (let i = 0; i < 3; i++) {
      await consumeRateLimit(db, 'login', `${testKey}-ok`, policy)
    }
    const used = await countRateLimitEvents(db, 'login', `${testKey}-ok`, policy.windowMs)
    expect(used).toBe(3)
  })

  it('blocks requests once the limit is exceeded', async () => {
    const policy = { maxAttempts: 2, windowMs: 60_000 }
    const key = `${testKey}-block`
    await consumeRateLimit(db, 'ai', key, policy)
    await consumeRateLimit(db, 'ai', key, policy)

    await expect(consumeRateLimit(db, 'ai', key, policy)).rejects.toBeInstanceOf(RateLimitError)
    try {
      await consumeRateLimit(db, 'ai', key, policy)
    }
    catch (err) {
      expect(err).toBeInstanceOf(RateLimitError)
      expect((err as RateLimitError).scope).toBe('ai')
      expect((err as RateLimitError).retryAfterSeconds).toBeGreaterThan(0)
    }
  })

  it('tracks independent keys separately', async () => {
    const policy = { maxAttempts: 1, windowMs: 60_000 }
    await consumeRateLimit(db, 'upload', `${testKey}-a`, policy)
    await expect(consumeRateLimit(db, 'upload', `${testKey}-a`, policy)).rejects.toBeInstanceOf(RateLimitError)
    await expect(consumeRateLimit(db, 'upload', `${testKey}-b`, policy)).resolves.toBeUndefined()
  })

  it('enforces credential_send limits per staff user and customer pair', async () => {
    const policy = { maxAttempts: 2, windowMs: 60_000 }
    const key = `${testKey}-staff:${testKey}-customer`
    await consumeRateLimit(db, 'credential_send', key, policy)
    await consumeRateLimit(db, 'credential_send', key, policy)
    await expect(consumeRateLimit(db, 'credential_send', key, policy)).rejects.toBeInstanceOf(RateLimitError)
  })

  it('enforces backup and pdf_gen scopes independently', async () => {
    const policy = { maxAttempts: 1, windowMs: 60_000 }
    const userKey = `${testKey}-pdf-backup`
    await consumeRateLimit(db, 'pdf_gen', userKey, policy)
    await consumeRateLimit(db, 'backup', userKey, policy)
    await expect(consumeRateLimit(db, 'pdf_gen', userKey, policy)).rejects.toBeInstanceOf(RateLimitError)
    await expect(consumeRateLimit(db, 'backup', userKey, policy)).rejects.toBeInstanceOf(RateLimitError)
  })

  it('persists rate limit events in the database', async () => {
    const key = `${testKey}-persist`
    await consumeRateLimit(db, 'verify_email', key, { maxAttempts: 5, windowMs: 60_000 })
    const [row] = await db
      .select()
      .from(rateLimitEvents)
      .where(and(eq(rateLimitEvents.scope, 'verify_email'), eq(rateLimitEvents.key, key)))
    expect(row?.scope).toBe('verify_email')
    expect(row?.key).toBe(key)
  })
})
