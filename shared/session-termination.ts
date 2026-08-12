/** Mass session termination — shared client/server constants. */

export const SESSION_TERMINATION_SETTINGS_KEY = 'security.last_session_termination'

/** How long clients treat a mass terminate as the reason for a 401. */
export const SESSION_TERMINATION_ACTIVE_MS = 20 * 60 * 1000

/** Countdown on /auth/session-terminated before redirecting to login. */
export const SESSION_TERMINATED_REDIRECT_SECONDS = 15

export type SessionTerminationRecord = {
  at: string
  byUserId: string
  byName: string
  byEmail: string
  revokedCount: number
}

export function isSessionTerminationActive(
  record: SessionTerminationRecord | null | undefined,
  nowMs = Date.now(),
): boolean {
  if (!record?.at) return false
  const at = Date.parse(record.at)
  if (!Number.isFinite(at)) return false
  return nowMs - at >= 0 && nowMs - at < SESSION_TERMINATION_ACTIVE_MS
}
