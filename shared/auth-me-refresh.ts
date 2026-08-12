/** Client auth session refresh cadence for `/api/auth/me`. */
export const AUTH_ME_POLL_MS = 5_000

/**
 * Focus / visibility may refresh sooner than the poll, but not in a tight loop.
 * Safe floor so tab focus storms cannot recreate the old per-click /me flood.
 */
export const AUTH_ME_FOCUS_MIN_GAP_MS = 1_000
