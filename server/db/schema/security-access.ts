import {
  boolean,
  doublePrecision,
  index,
  inet,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core'
import type { GeoPoint } from '../../../shared/geo/point-in-polygon'
import {
  GEO_SOURCES,
  IP_BAN_SOURCES,
  IP_BAN_STATUSES,
  SECURITY_BLOCK_REASONS,
  SECURITY_EVENT_OUTCOMES,
  SECURITY_EVENT_STAGES,
  SECURITY_EVENT_TYPES,
  SECURITY_ZONE_KINDS,
} from '../../../shared/validators/security-access'

/**
 * IP ban list. Each row is one address or CIDR range, stored canonically in
 * `ip_rule` so matching never depends on formatting. Rows are kept after a ban
 * is lifted or expires so the history stays auditable.
 *
 * These tables are created at runtime by ensure-security-schema (no journaled
 * migration) to stay decoupled from the Drizzle migration sequence.
 */
export const ipBans = pgTable('ip_bans', {
  id: uuid('id').primaryKey().defaultRandom(),
  /** Canonical `1.2.3.4` or `1.2.3.0/24`. Unique across the table. */
  ipRule: text('ip_rule').notNull().unique(),
  /** Populated only for single-address bans, for inet-typed querying. */
  ipAddress: inet('ip_address'),
  kind: text('kind', { enum: ['single', 'range'] }).notNull().default('single'),
  family: integer('family').notNull().default(4),

  reason: text('reason').notNull().default(''),
  notes: text('notes').notNull().default(''),
  source: text('source', { enum: IP_BAN_SOURCES }).notNull().default('manual'),
  status: text('status', { enum: IP_BAN_STATUSES }).notNull().default('active'),
  expiresAt: timestamp('expires_at', { withTimezone: true }),

  createdBy: uuid('created_by'),
  createdByName: text('created_by_name'),
  createdByEmail: text('created_by_email'),
  liftedAt: timestamp('lifted_at', { withTimezone: true }),
  liftedBy: uuid('lifted_by'),
  liftedByName: text('lifted_by_name'),
  liftReason: text('lift_reason'),

  /** Rolling counters maintained as the ban blocks traffic. */
  hitCount: integer('hit_count').notNull().default(0),
  lastHitAt: timestamp('last_hit_at', { withTimezone: true }),
  /** Failed sign-in attempts observed from this rule before it was created. */
  triggerAttempts: integer('trigger_attempts').notNull().default(0),

  /** Last known geolocation, so the ban list is readable without a lookup. */
  lastLocationLabel: text('last_location_label'),
  lastCountry: text('last_country'),
  lastLatitude: doublePrecision('last_latitude'),
  lastLongitude: doublePrecision('last_longitude'),
  lastUserAgent: text('last_user_agent'),
  /** Distinct usernames/emails seen from this rule. */
  lastIdentifiers: jsonb('last_identifiers').$type<string[]>().notNull().default([]),

  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, table => [
  index('ip_bans_status_idx').on(table.status),
  index('ip_bans_created_idx').on(table.createdAt),
])

export type IpBanRow = typeof ipBans.$inferSelect

/**
 * Named geofence zones drawn on the security map. `allow` zones define where
 * access is permitted (any enabled allow zone satisfies the check); `block`
 * zones deny outright and take precedence.
 */
export const geofences = pgTable('geofences', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: text('name').notNull(),
  description: text('description').notNull().default(''),
  kind: text('kind', { enum: SECURITY_ZONE_KINDS }).notNull().default('allow'),
  enabled: boolean('enabled').notNull().default(true),
  color: text('color').notNull().default('#4f46e5'),
  polygon: jsonb('polygon').$type<GeoPoint[]>().notNull(),

  /** Cached extent so the map and coarse rejection tests skip the ring math. */
  minLat: doublePrecision('min_lat'),
  maxLat: doublePrecision('max_lat'),
  minLng: doublePrecision('min_lng'),
  maxLng: doublePrecision('max_lng'),

  createdBy: uuid('created_by'),
  createdByName: text('created_by_name'),
  hitCount: integer('hit_count').notNull().default(0),
  lastHitAt: timestamp('last_hit_at', { withTimezone: true }),

  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, table => [
  index('geofences_enabled_idx').on(table.enabled),
])

export type GeofenceRow = typeof geofences.$inferSelect

/**
 * Every evaluated site visit and sign-in attempt. This is the security map's
 * data source and the forensic record behind the ban list: it captures where
 * the request came from, which rule decided the outcome, and — for sign-ins —
 * exactly which credentials were tried.
 */
export const accessEvents = pgTable('access_events', {
  id: uuid('id').primaryKey().defaultRandom(),
  eventType: text('event_type', { enum: SECURITY_EVENT_TYPES }).notNull(),
  stage: text('stage', { enum: SECURITY_EVENT_STAGES }).notNull().default('page_load'),
  outcome: text('outcome', { enum: SECURITY_EVENT_OUTCOMES }).notNull().default('allowed'),
  blockReason: text('block_reason', { enum: SECURITY_BLOCK_REASONS }),
  /** False when the policy was in monitor mode and the request went through. */
  enforced: boolean('enforced').notNull().default(false),

  ipAddress: inet('ip_address'),
  /** Ban rule that matched, kept as text so it survives ban deletion. */
  matchedIpRule: text('matched_ip_rule'),
  matchedBanId: uuid('matched_ban_id'),
  matchedGeofenceId: uuid('matched_geofence_id'),
  matchedGeofenceName: text('matched_geofence_name'),

  userId: uuid('user_id'),
  userName: text('user_name'),
  userEmail: text('user_email'),
  sessionId: uuid('session_id'),
  path: text('path'),
  userAgent: text('user_agent'),
  requestId: text('request_id'),

  /** Coordinates the decision was made against, plus where they came from. */
  latitude: doublePrecision('latitude'),
  longitude: doublePrecision('longitude'),
  geoSource: text('geo_source', { enum: GEO_SOURCES }).notNull().default('none'),
  accuracyM: doublePrecision('accuracy_m'),
  ipLatitude: doublePrecision('ip_latitude'),
  ipLongitude: doublePrecision('ip_longitude'),
  deviceLatitude: doublePrecision('device_latitude'),
  deviceLongitude: doublePrecision('device_longitude'),

  locationLabel: text('location_label'),
  city: text('city'),
  region: text('region'),
  postalCode: text('postal_code'),
  country: text('country'),
  timezone: text('timezone'),

  /** Credentials presented on a sign-in attempt. Never the password itself. */
  attemptedIdentifier: text('attempted_identifier'),
  attemptedPortal: text('attempted_portal'),
  /** Salted hash prefix — lets the UI group attempts reusing one password. */
  passwordFingerprint: text('password_fingerprint'),
  passwordLength: integer('password_length'),
  accountExists: boolean('account_exists'),
  failureReason: text('failure_reason'),

  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, table => [
  index('access_events_created_idx').on(table.createdAt),
  index('access_events_type_idx').on(table.eventType),
  index('access_events_ip_idx').on(table.ipAddress),
  index('access_events_outcome_idx').on(table.outcome),
  index('access_events_identifier_idx').on(table.attemptedIdentifier),
])

export type AccessEventRow = typeof accessEvents.$inferSelect
