import { authErrorCode, authErrorRetryAfterSeconds } from '~/utils/auth-errors'

export type AuthRateLimitScope = 'login' | 'verify_email' | 'password_reset'

const STORAGE_PREFIX = 'dorinc_rate_limit_'

export function rateLimitStorageKey(scope: AuthRateLimitScope): string {
  return `${STORAGE_PREFIX}${scope}`
}

export function formatRateLimitCountdown(totalSeconds: number): string {
  const secs = Math.max(0, Math.ceil(totalSeconds))
  const minutes = Math.floor(secs / 60)
  const seconds = secs % 60
  if (minutes <= 0) return `${seconds}s`
  return `${minutes}:${String(seconds).padStart(2, '0')}`
}

export function readRateLimitUntil(scope: AuthRateLimitScope): number {
  if (!import.meta.client) return 0
  try {
    const raw = sessionStorage.getItem(rateLimitStorageKey(scope))
    if (!raw) return 0
    const parsed = JSON.parse(raw) as { until?: number }
    return typeof parsed.until === 'number' ? parsed.until : 0
  }
  catch {
    return 0
  }
}

export function writeRateLimitUntil(scope: AuthRateLimitScope, untilMs: number): void {
  if (!import.meta.client) return
  if (untilMs <= Date.now()) {
    sessionStorage.removeItem(rateLimitStorageKey(scope))
    return
  }
  sessionStorage.setItem(rateLimitStorageKey(scope), JSON.stringify({ until: untilMs }))
}

export function clearRateLimitUntil(scope: AuthRateLimitScope): void {
  if (!import.meta.client) return
  sessionStorage.removeItem(rateLimitStorageKey(scope))
}

export function rateLimitRemainingSeconds(scope: AuthRateLimitScope, now = Date.now()): number {
  const until = readRateLimitUntil(scope)
  if (!until) return 0
  return Math.max(0, Math.ceil((until - now) / 1000))
}

export function rateLimitMessage(
  scope: AuthRateLimitScope,
  remainingSeconds: number,
): string {
  const countdown = formatRateLimitCountdown(remainingSeconds)
  switch (scope) {
    case 'verify_email':
      return `Too many verification email requests. Please wait ${countdown} before trying again.`
    case 'password_reset':
      return `Too many password reset requests. Please wait ${countdown} before trying again.`
    default:
      return `Too many sign-in attempts from your network. For security, sign-in is paused. You can try again in ${countdown}.`
  }
}

/** Apply a 429 RATE_LIMITED response to sessionStorage; returns false when not rate limited. */
export function applyRateLimitFromError(err: unknown, scope: AuthRateLimitScope): boolean {
  if (authErrorCode(err) !== 'RATE_LIMITED') return false
  const secs = authErrorRetryAfterSeconds(err) ?? 15 * 60
  const until = Date.now() + secs * 1000
  const existing = readRateLimitUntil(scope)
  writeRateLimitUntil(scope, Math.max(until, existing))
  return true
}
