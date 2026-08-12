/**
 * Display classification for access-gate security events.
 * Raw DB outcomes stay visit/login + allowed/blocked/login_*; UI groups are clearer.
 */

export const ACCESS_BLOCK_REASONS = ['ip_banned', 'geo_outside', 'geo_unknown'] as const
export type AccessBlockReason = (typeof ACCESS_BLOCK_REASONS)[number]

export type AccessDisplayGroup
  = 'access_granted'
    | 'fail'
    | 'geofence_blocked'
    | 'blocked'

export const ACCESS_DISPLAY_GROUP_LABELS: Record<AccessDisplayGroup, string> = {
  access_granted: 'Access Granted',
  fail: 'Fail',
  geofence_blocked: 'Geo Blocked',
  blocked: 'Blocked',
}

/** Map/legend colors for the cleaned-up security groups. */
export const ACCESS_DISPLAY_GROUP_COLORS: Record<AccessDisplayGroup, string> = {
  access_granted: '#16a34a',
  fail: '#f59e0b',
  geofence_blocked: '#4f46e5',
  blocked: '#dc2626',
}

export type AccessEventDisplayInput = {
  outcome: string
  blockReason?: string | null
  path?: string | null
}

/** Paths that mean the visitor was sent to a security restriction page. */
export function isSecurityRestrictionPath(path: string | null | undefined): boolean {
  const raw = String(path || '').trim().split('?')[0] || ''
  return raw === '/auth/access-restricted'
    || raw.startsWith('/auth/access-restricted/')
    || raw === '/auth/verify-location'
    || raw.startsWith('/auth/verify-location/')
}

/**
 * Classify an event into the security UI groups:
 * - Access Granted — allowed visit / successful login (no security block)
 * - Fail — login credentials failed (or similar connection fail)
 * - Geo Blocked — blocked for being outside / unknown geo, or landed on
 *   /auth/access-restricted / verify-location
 * - Blocked — IP ban or hard block from connecting
 */
export function accessEventDisplayGroup(ev: AccessEventDisplayInput): AccessDisplayGroup {
  const outcome = String(ev.outcome || '').trim()
  const reason = String(ev.blockReason || '').trim()

  if (outcome === 'login_failed') return 'fail'

  if (outcome === 'blocked') {
    if (reason === 'ip_banned') return 'blocked'
    if (reason === 'geo_outside' || reason === 'geo_unknown') return 'geofence_blocked'
    // Legacy blocked rows without reason: restriction pages are geofence; else hard block.
    if (isSecurityRestrictionPath(ev.path)) return 'geofence_blocked'
    return 'blocked'
  }

  // Gate pages used to be recorded as "allowed" because redirects are exempt —
  // still show them as Geo Blocked when the visitor landed on the restriction page.
  if (
    (outcome === 'allowed' || outcome === 'login_success')
    && isSecurityRestrictionPath(ev.path)
  ) {
    if (reason === 'ip_banned') return 'blocked'
    return 'geofence_blocked'
  }

  if (outcome === 'allowed' || outcome === 'login_success') return 'access_granted'
  return 'access_granted'
}

export function accessEventDisplayLabel(ev: AccessEventDisplayInput): string {
  return ACCESS_DISPLAY_GROUP_LABELS[accessEventDisplayGroup(ev)]
}

export function accessEventDisplayColor(ev: AccessEventDisplayInput): string {
  return ACCESS_DISPLAY_GROUP_COLORS[accessEventDisplayGroup(ev)]
}

export function accessEventUserLabel(ev: {
  userName?: string | null
  userEmail?: string | null
  userId?: string | null
}): string {
  const name = String(ev.userName || '').trim()
  const email = String(ev.userEmail || '').trim()
  if (name && email && name !== email) return `${name} · ${email}`
  if (name) return name
  if (email) return email
  if (ev.userId) return 'Known user'
  return '—'
}

export function parseAccessBlockReason(raw: unknown): AccessBlockReason | null {
  const text = typeof raw === 'string' ? raw.trim() : ''
  return (ACCESS_BLOCK_REASONS as readonly string[]).includes(text)
    ? (text as AccessBlockReason)
    : null
}

export function parseAccessDisplayGroup(raw: unknown): AccessDisplayGroup | undefined {
  const text = typeof raw === 'string' ? raw.trim() : ''
  if (
    text === 'access_granted'
    || text === 'fail'
    || text === 'geofence_blocked'
    || text === 'blocked'
  ) {
    return text
  }
  return undefined
}
