/**
 * Cool-down that suppresses forced-gate redirects (announcements / password)
 * after a redirect loop was detected. Without it the breaker only cleared the
 * gate locally, the next /api/auth/me poll re-locked it, and every navigation
 * re-entered the loop — hammering the server until nothing loaded for anyone.
 */
const STORAGE_KEY = 'dorinc_gate_cooldown_until'
const DEFAULT_COOLDOWN_MS = 30_000

/** Fallback when sessionStorage is unavailable (private mode / quota). */
let memoryUntil = 0

export function startGateCooldown(ms: number = DEFAULT_COOLDOWN_MS): void {
  const until = Date.now() + ms
  memoryUntil = until
  if (typeof sessionStorage === 'undefined') return
  try {
    sessionStorage.setItem(STORAGE_KEY, String(until))
  }
  catch {
    // memoryUntil still covers this tab
  }
}

export function isGateCooldownActive(): boolean {
  const now = Date.now()
  if (memoryUntil > now) return true
  if (typeof sessionStorage === 'undefined') return false
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY)
    return !!raw && Number(raw) > now
  }
  catch {
    return false
  }
}

export function clearGateCooldown(): void {
  memoryUntil = 0
  if (typeof sessionStorage === 'undefined') return
  try {
    sessionStorage.removeItem(STORAGE_KEY)
  }
  catch {
    // ignore
  }
}
