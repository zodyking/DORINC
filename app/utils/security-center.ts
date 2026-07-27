import type {
  GeoSource,
  IpBanSource,
  IpBanStatus,
  SecurityBlockReason,
  SecurityEventOutcome,
  SecurityEventStage,
  SecurityEventType,
  SecurityZoneKind,
} from '#shared/validators/security-access'
import type { GeoPoint } from '#shared/geo/point-in-polygon'

export interface SecurityEvent {
  id: string
  eventType: SecurityEventType
  stage: SecurityEventStage
  outcome: SecurityEventOutcome
  blockReason: SecurityBlockReason | null
  enforced: boolean
  ipAddress: string | null
  matchedIpRule: string | null
  matchedBanId: string | null
  matchedGeofenceId: string | null
  matchedGeofenceName: string | null
  userId: string | null
  userName: string | null
  userEmail: string | null
  path: string | null
  userAgent: string | null
  latitude: number | null
  longitude: number | null
  geoSource: GeoSource
  accuracyM: number | null
  locationLabel: string | null
  city: string | null
  region: string | null
  country: string | null
  timezone: string | null
  attemptedIdentifier: string | null
  attemptedPortal: string | null
  passwordFingerprint: string | null
  passwordLength: number | null
  accountExists: boolean | null
  failureReason: string | null
  createdAt: string
}

export interface SecurityBan {
  id: string
  ipRule: string
  kind: 'single' | 'range'
  family: number
  reason: string
  notes: string
  source: IpBanSource
  status: IpBanStatus
  expiresAt: string | null
  createdByName: string | null
  createdByEmail: string | null
  liftedAt: string | null
  liftedByName: string | null
  liftReason: string | null
  hitCount: number
  lastHitAt: string | null
  triggerAttempts: number
  lastLocationLabel: string | null
  lastCountry: string | null
  lastLatitude: number | null
  lastLongitude: number | null
  lastUserAgent: string | null
  lastIdentifiers: string[]
  createdAt: string
  updatedAt: string
}

export interface SecurityZone {
  id: string
  name: string
  description: string
  kind: SecurityZoneKind
  enabled: boolean
  color: string
  polygon: GeoPoint[]
  pointCount: number
  hitCount: number
  lastHitAt: string | null
  createdByName: string | null
  createdAt: string
  updatedAt: string
}

export interface SecurityThreat {
  key: string
  ipAddress: string | null
  attemptedIdentifier: string | null
  attempts: number
  failedAttempts: number
  blockedAttempts: number
  successfulLogins: number
  distinctPasswords: number
  repeatedSamePassword: boolean
  accountExists: boolean | null
  portals: string[]
  failureReasons: string[]
  locationLabel: string | null
  country: string | null
  latitude: number | null
  longitude: number | null
  userAgent: string | null
  firstSeenAt: string
  lastSeenAt: string
  alreadyBanned: boolean
}

export interface SecurityOverview {
  events: {
    totalEvents: number
    events24h: number
    blocked24h: number
    wouldBlock24h: number
    failedLogins24h: number
    successfulLogins24h: number
    uniqueIps24h: number
    unmappedEvents: number
  }
  activeBans: number
  zones: { total: number, enabled: number, allow: number, block: number }
  snapshotAgeMs: number | null
}

export const MARKER_COLORS = {
  blocked: '#dc2626',
  wouldBlock: '#f97316',
  loginFailed: '#f59e0b',
  loginSuccess: '#4f46e5',
  visit: '#0ea5e9',
} as const

export function eventMarkerColor(event: Pick<SecurityEvent, 'outcome' | 'eventType'>): string {
  switch (event.outcome) {
    case 'blocked': return MARKER_COLORS.blocked
    case 'would_block': return MARKER_COLORS.wouldBlock
    case 'login_failed': return MARKER_COLORS.loginFailed
    case 'login_success': return MARKER_COLORS.loginSuccess
    default: return event.eventType === 'login' ? MARKER_COLORS.loginSuccess : MARKER_COLORS.visit
  }
}

const OUTCOME_LABELS: Record<SecurityEventOutcome, string> = {
  allowed: 'Allowed',
  blocked: 'Blocked',
  would_block: 'Would block',
  login_success: 'Signed in',
  login_failed: 'Failed sign-in',
}

export function outcomeLabel(outcome: SecurityEventOutcome): string {
  return OUTCOME_LABELS[outcome] ?? outcome
}

export function outcomePillClass(outcome: SecurityEventOutcome): string {
  switch (outcome) {
    case 'blocked': return 'over'
    case 'would_block': return 'warn'
    case 'login_failed': return 'warn'
    case 'login_success': return 'ok'
    default: return 'gray'
  }
}

const BLOCK_REASON_LABELS: Record<SecurityBlockReason, string> = {
  ip_banned: 'IP banned',
  geo_outside_allowed: 'Outside allowed area',
  geo_inside_blocked: 'Inside blocked area',
  geo_unknown: 'Location unknown',
}

export function blockReasonLabel(reason: SecurityBlockReason | null): string {
  return reason ? BLOCK_REASON_LABELS[reason] ?? reason : '—'
}

const FAILURE_LABELS: Record<string, string> = {
  invalid_credentials: 'Wrong password',
  email_not_verified: 'Email not verified',
  not_approved: 'Not approved',
  account_disabled: 'Account disabled',
  temp_password_expired: 'Temp password expired',
  portal_disabled: 'Portal disabled',
  portal_not_linked: 'Portal not linked',
  wrong_portal: 'Wrong portal',
}

export function failureReasonLabel(reason: string | null): string {
  if (!reason) return '—'
  return FAILURE_LABELS[reason] ?? reason.replace(/_/g, ' ')
}

const GEO_SOURCE_LABELS: Record<GeoSource, string> = {
  device: 'Device GPS',
  ip: 'IP lookup',
  none: 'Unknown',
}

export function geoSourceLabel(source: GeoSource): string {
  return GEO_SOURCE_LABELS[source] ?? source
}

const BAN_SOURCE_LABELS: Record<IpBanSource, string> = {
  manual: 'Manual',
  map: 'From map',
  auto_failed_logins: 'Auto — failed logins',
  auto_geofence: 'Auto — geofence',
}

export function banSourceLabel(source: IpBanSource): string {
  return BAN_SOURCE_LABELS[source] ?? source
}

export function banStatusPillClass(status: IpBanStatus): string {
  switch (status) {
    case 'active': return 'over'
    case 'expired': return 'gray'
    case 'lifted': return 'ok'
    default: return 'gray'
  }
}

export function formatWhen(iso: string | null): string {
  if (!iso) return '—'
  const date = new Date(iso)
  return Number.isNaN(date.getTime()) ? iso : date.toLocaleString()
}

export function formatRelative(iso: string | null): string {
  if (!iso) return '—'
  const then = new Date(iso).getTime()
  if (Number.isNaN(then)) return iso
  const seconds = Math.round((Date.now() - then) / 1000)
  if (seconds < 60) return 'just now'
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`
  return `${Math.floor(seconds / 86400)}d ago`
}

/**
 * Attempted passwords are never stored, only a keyed fingerprint. Render it in
 * a way that reads as an identifier rather than something recoverable.
 */
export function passwordSummary(event: Pick<SecurityEvent, 'passwordFingerprint' | 'passwordLength'>): string {
  if (!event.passwordFingerprint && event.passwordLength == null) return '—'
  const length = event.passwordLength != null ? `${event.passwordLength} chars` : 'unknown length'
  return event.passwordFingerprint ? `${length} · #${event.passwordFingerprint}` : length
}

export function shortUserAgent(userAgent: string | null): string {
  if (!userAgent) return '—'
  const browser = userAgent.match(/(Firefox|Edg|OPR|Chrome|Safari)\/[\d.]+/)?.[0] ?? ''
  const platform = userAgent.match(/\(([^)]+)\)/)?.[1]?.split(';')[0]?.trim() ?? ''
  const summary = [platform, browser.replace('Edg', 'Edge').replace('OPR', 'Opera')].filter(Boolean).join(' · ')
  return summary || userAgent.slice(0, 60)
}
