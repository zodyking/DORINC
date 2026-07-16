import { getClientIp } from './client-ip'
import type { H3Event } from 'h3'
import { useDb } from '../db/client'
import { RateLimitError, consumeRateLimit } from '../services/rate-limit.service'
import type { RateLimitScope } from '../db/schema/rate-limits'
import type { RateLimitPolicy } from '../services/rate-limit.service'
import { apiError } from './api-error'

export async function requireRateLimit(
  event: H3Event,
  scope: RateLimitScope,
  key: string,
  policyOverride?: Partial<RateLimitPolicy>,
) {
  try {
    await consumeRateLimit(useDb(), scope, key, policyOverride)
  }
  catch (err) {
    if (err instanceof RateLimitError) {
      throw apiError(event, 'RATE_LIMITED', 'Too many requests — try again later', {
        scope: err.scope,
        retryAfterSeconds: err.retryAfterSeconds,
      })
    }
    throw err
  }
}

export function rateLimitKeyFromIp(event: H3Event, suffix = 'ip') {
  const ip = getClientIp(event) ?? 'unknown'
  return `${suffix}:${ip}`
}

export function rateLimitKeyFromUser(userId: string, suffix?: string) {
  return suffix ? `${suffix}:${userId}` : userId
}
