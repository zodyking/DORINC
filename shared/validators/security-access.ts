import { z } from 'zod'
import { normalizeIpRule } from '../net/ip-match'

/**
 * Enforcement level for a check. `monitor` records what *would* have been
 * blocked without denying anyone — the safe way to validate a new rule set
 * before switching it to `enforce`.
 */
export const SECURITY_ENFORCEMENT_LEVELS = ['off', 'monitor', 'enforce'] as const
export type SecurityEnforcementLevel = (typeof SECURITY_ENFORCEMENT_LEVELS)[number]

export const SECURITY_ZONE_KINDS = ['allow', 'block'] as const
export type SecurityZoneKind = (typeof SECURITY_ZONE_KINDS)[number]

export const IP_BAN_SOURCES = ['manual', 'map', 'auto_failed_logins', 'auto_geofence'] as const
export type IpBanSource = (typeof IP_BAN_SOURCES)[number]

export const IP_BAN_STATUSES = ['active', 'expired', 'lifted'] as const
export type IpBanStatus = (typeof IP_BAN_STATUSES)[number]

export const SECURITY_EVENT_STAGES = ['page_load', 'api', 'login', 'login_complete'] as const
export type SecurityEventStage = (typeof SECURITY_EVENT_STAGES)[number]

export const SECURITY_EVENT_TYPES = ['visit', 'login'] as const
export type SecurityEventType = (typeof SECURITY_EVENT_TYPES)[number]

export const SECURITY_EVENT_OUTCOMES = [
  'allowed',
  'blocked',
  'would_block',
  'login_success',
  'login_failed',
] as const
export type SecurityEventOutcome = (typeof SECURITY_EVENT_OUTCOMES)[number]

export const SECURITY_BLOCK_REASONS = [
  'ip_banned',
  'geo_outside_allowed',
  'geo_inside_blocked',
  'geo_unknown',
] as const
export type SecurityBlockReason = (typeof SECURITY_BLOCK_REASONS)[number]

export const GEO_SOURCES = ['device', 'ip', 'none'] as const
export type GeoSource = (typeof GEO_SOURCES)[number]

export const geoPointSchema = z.object({
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
})

export const geoPolygonSchema = z.array(geoPointSchema).min(3).max(2000)

/** Accepts a single address or a CIDR block; stores the canonical form. */
export const ipRuleSchema = z.string().trim().min(2).max(64).transform((value, ctx) => {
  const canonical = normalizeIpRule(value)
  if (!canonical) {
    ctx.addIssue({ code: 'custom', message: 'Enter a valid IP address or CIDR range' })
    return z.NEVER
  }
  return canonical
})

export const autoBanPolicySchema = z.object({
  /** Ban an IP automatically once it trips the failed-login threshold. */
  enabled: z.boolean().default(false),
  failedAttempts: z.number().int().min(3).max(500).default(10),
  windowMinutes: z.number().int().min(1).max(1440).default(15),
  /** 0 means the automatic ban never expires on its own. */
  durationMinutes: z.number().int().min(0).max(525_600).default(60),
})

export type AutoBanPolicy = z.infer<typeof autoBanPolicySchema>

/**
 * Site-wide security policy. Everything defaults to capture-only so enabling
 * the feature can never lock anyone out until an admin opts into enforcement.
 */
export const securityPolicySchema = z.object({
  /** Master switch for capture. Enforcement additionally needs a level below. */
  enabled: z.boolean().default(false),
  ipEnforcement: z.enum(SECURITY_ENFORCEMENT_LEVELS).default('off'),
  geoEnforcement: z.enum(SECURITY_ENFORCEMENT_LEVELS).default('off'),
  /**
   * What to do when no coordinates could be resolved at all. Defaults to
   * allowing, because failing closed on an unresolved IP locks out real users
   * the first time they visit from a new network.
   */
  geoUnknownAction: z.enum(['allow', 'block']).default('allow'),
  /** Tolerance applied to the reported GPS accuracy near a zone boundary. */
  geoAccuracyBufferM: z.number().int().min(0).max(50_000).default(250),
  /** Ignore a device fix whose reported accuracy is worse than this. */
  maxDeviceAccuracyM: z.number().int().min(0).max(200_000).default(20_000),
  /** Also enforce IP bans on /api requests, not just page loads. */
  enforceOnApi: z.boolean().default(true),
  /** Where blocked visitors are sent. Empty → the built-in denied screen. */
  redirectUrl: z.string().trim().max(2000).default(''),
  blockMessage: z.string().trim().max(500).default('Access to this site is restricted from your location.'),
  captureVisits: z.boolean().default(true),
  /** Per IP+path throttle so one client cannot flood the event table. */
  captureThrottleSeconds: z.number().int().min(0).max(3600).default(60),
  retentionDays: z.number().int().min(1).max(3650).default(90),
  /**
   * Record which username/email was tried on failed sign-ins, plus a salted
   * fingerprint of the password so repeated attempts can be correlated.
   * Passwords themselves are never stored.
   */
  recordCredentials: z.boolean().default(true),
  autoBan: autoBanPolicySchema.default({
    enabled: false,
    failedAttempts: 10,
    windowMinutes: 15,
    durationMinutes: 60,
  }),
})

export type SecurityPolicy = z.infer<typeof securityPolicySchema>

export const DEFAULT_SECURITY_POLICY: SecurityPolicy = securityPolicySchema.parse({})

export const ipBanCreateSchema = z.object({
  ipRule: ipRuleSchema,
  reason: z.string().trim().max(500).default(''),
  notes: z.string().trim().max(2000).default(''),
  /** ISO timestamp; omit or null for a permanent ban. */
  expiresAt: z.string().datetime().nullable().optional(),
  source: z.enum(IP_BAN_SOURCES).default('manual'),
})

export type IpBanCreateInput = z.infer<typeof ipBanCreateSchema>

export const ipBanUpdateSchema = z.object({
  reason: z.string().trim().max(500).optional(),
  notes: z.string().trim().max(2000).optional(),
  expiresAt: z.string().datetime().nullable().optional(),
  status: z.enum(IP_BAN_STATUSES).optional(),
  liftReason: z.string().trim().max(500).optional(),
})

export const ipBanQuerySchema = z.object({
  status: z.enum([...IP_BAN_STATUSES, 'all']).default('active'),
  search: z.string().trim().max(120).optional(),
  limit: z.coerce.number().int().min(1).max(500).default(200),
  offset: z.coerce.number().int().min(0).default(0),
})

export const geofenceCreateSchema = z.object({
  name: z.string().trim().min(1).max(120),
  description: z.string().trim().max(1000).default(''),
  kind: z.enum(SECURITY_ZONE_KINDS).default('allow'),
  enabled: z.boolean().default(true),
  color: z.string().trim().regex(/^#[0-9a-fA-F]{6}$/).default('#4f46e5'),
  polygon: geoPolygonSchema,
})

export type GeofenceCreateInput = z.infer<typeof geofenceCreateSchema>

export const geofenceUpdateSchema = geofenceCreateSchema.partial()

export const securityEventQuerySchema = z.object({
  eventType: z.enum(SECURITY_EVENT_TYPES).optional(),
  outcome: z.enum(SECURITY_EVENT_OUTCOMES).optional(),
  stage: z.enum(SECURITY_EVENT_STAGES).optional(),
  /** Only rows that carry coordinates — used by the map. */
  mappedOnly: z.coerce.boolean().optional(),
  blockedOnly: z.coerce.boolean().optional(),
  search: z.string().trim().max(200).optional(),
  sinceHours: z.coerce.number().int().min(1).max(8760).optional(),
  limit: z.coerce.number().int().min(1).max(5000).default(500),
  offset: z.coerce.number().int().min(0).default(0),
})

export const securityThreatQuerySchema = z.object({
  sinceHours: z.coerce.number().int().min(1).max(8760).default(168),
  minAttempts: z.coerce.number().int().min(1).max(1000).default(2),
  limit: z.coerce.number().int().min(1).max(500).default(100),
})

/** Body posted by the on-load browser worker. */
export const securityCheckRequestSchema = z.object({
  path: z.string().trim().max(500).default('/'),
  /** Device coordinates, only sent when the browser already granted access. */
  device: z.object({
    latitude: z.number().min(-90).max(90),
    longitude: z.number().min(-180).max(180),
    accuracyM: z.number().min(0).max(1_000_000).nullable().optional(),
  }).nullable().optional(),
  timezone: z.string().trim().max(80).nullable().optional(),
  screen: z.string().trim().max(40).nullable().optional(),
})

export type SecurityCheckRequest = z.infer<typeof securityCheckRequestSchema>

export interface SecurityCheckResponse {
  blocked: boolean
  reason: SecurityBlockReason | null
  redirectUrl: string | null
  message: string
  /** True when the browser should ask for GPS to complete a geofence check. */
  needsDeviceLocation: boolean
}
