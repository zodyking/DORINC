import { and, count, eq, gte, sql } from 'drizzle-orm'
import type { Db } from '../db/client'
import { rateLimitEvents, type RateLimitScope } from '../db/schema/rate-limits'

export interface RateLimitPolicy {
  maxAttempts: number
  windowMs: number
}

export const DEFAULT_RATE_LIMITS: Record<RateLimitScope, RateLimitPolicy> = {
  login: { maxAttempts: 10, windowMs: 15 * 60 * 1000 },
  verify_email: { maxAttempts: 5, windowMs: 15 * 60 * 1000 },
  credential_send: { maxAttempts: 5, windowMs: 60 * 60 * 1000 },
  ai: { maxAttempts: 30, windowMs: 60 * 60 * 1000 },
  upload: { maxAttempts: 20, windowMs: 60 * 60 * 1000 },
  pdf_gen: { maxAttempts: 10, windowMs: 60 * 60 * 1000 },
  backup: { maxAttempts: 3, windowMs: 60 * 60 * 1000 },
}

export class RateLimitError extends Error {
  readonly code = 'RATE_LIMITED' as const

  constructor(
    public readonly scope: RateLimitScope,
    public readonly retryAfterSeconds: number,
  ) {
    super('RATE_LIMITED')
  }
}

function resolvePolicy(scope: RateLimitScope, override?: Partial<RateLimitPolicy>): RateLimitPolicy {
  const base = DEFAULT_RATE_LIMITS[scope]
  return { ...base, ...override }
}

export async function countRateLimitEvents(
  db: Db,
  scope: RateLimitScope,
  key: string,
  windowMs: number,
): Promise<number> {
  const since = new Date(Date.now() - windowMs)
  const [row] = await db
    .select({ value: count() })
    .from(rateLimitEvents)
    .where(and(
      eq(rateLimitEvents.scope, scope),
      eq(rateLimitEvents.key, key),
      gte(rateLimitEvents.createdAt, since),
    ))
  return Number(row?.value ?? 0)
}

export async function consumeRateLimit(
  db: Db,
  scope: RateLimitScope,
  key: string,
  policyOverride?: Partial<RateLimitPolicy>,
): Promise<void> {
  const policy = resolvePolicy(scope, policyOverride)
  const used = await countRateLimitEvents(db, scope, key, policy.windowMs)

  if (used >= policy.maxAttempts) {
    const retryAfterSeconds = Math.max(1, Math.ceil(policy.windowMs / 1000))
    throw new RateLimitError(scope, retryAfterSeconds)
  }

  await db.insert(rateLimitEvents).values({ scope, key })
}

/** Remove stale rows — safe to call periodically; tests may invoke directly. */
export async function pruneRateLimitEvents(db: Db, olderThanMs = 24 * 60 * 60 * 1000) {
  const cutoff = new Date(Date.now() - olderThanMs)
  await db.delete(rateLimitEvents).where(sql`${rateLimitEvents.createdAt} < ${cutoff}`)
}
