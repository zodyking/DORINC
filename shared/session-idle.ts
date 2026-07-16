/** Idle time before the session warning overlay appears. */
export const SESSION_IDLE_WARNING_AFTER_MS = 5 * 60 * 1000

/** Countdown duration shown in the warning overlay before sign-out. */
export const SESSION_IDLE_COUNTDOWN_MS = 60 * 1000

export const SESSION_IDLE_COUNTDOWN_SECONDS = Math.floor(SESSION_IDLE_COUNTDOWN_MS / 1000)

export function formatSessionCountdown(seconds: number): string {
  const safe = Math.max(0, Math.floor(seconds))
  const mins = Math.floor(safe / 60)
  const secs = safe % 60
  if (mins > 0) return `${mins}:${String(secs).padStart(2, '0')}`
  return String(secs)
}
