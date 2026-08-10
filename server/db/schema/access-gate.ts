import { doublePrecision, index, inet, integer, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core'

export const ACCESS_EVENT_TYPES = ['visit', 'login'] as const
export const ACCESS_EVENT_OUTCOMES = ['allowed', 'blocked', 'login_success', 'login_failed'] as const

/**
 * Every captured site visit and login attempt for the access-gate map.
 * Populated only while the access gate is enabled. Created at runtime via
 * ensure-access-gate-schema (no journaled migration) to stay decoupled from
 * the Drizzle migration sequence.
 */
export const accessEvents = pgTable('access_events', {
  id: uuid('id').primaryKey().defaultRandom(),
  eventType: text('event_type', { enum: ACCESS_EVENT_TYPES }).notNull(),
  outcome: text('outcome', { enum: ACCESS_EVENT_OUTCOMES }).notNull().default('allowed'),
  ipAddress: inet('ip_address'),
  userId: uuid('user_id'),
  userName: text('user_name'),
  userEmail: text('user_email'),
  path: text('path'),
  userAgent: text('user_agent'),
  deviceId: text('device_id'),
  os: text('os'),
  deviceType: text('device_type'),
  screenResolution: text('screen_resolution'),
  devicePixelRatio: doublePrecision('device_pixel_ratio'),
  cpuCores: integer('cpu_cores'),
  deviceMemoryGb: doublePrecision('device_memory_gb'),
  gpuRenderer: text('gpu_renderer'),
  canvasFingerprint: text('canvas_fingerprint'),
  webglFingerprint: text('webgl_fingerprint'),
  audioFingerprint: text('audio_fingerprint'),
  timezone: text('timezone'),
  language: text('language'),
  maxTouchPoints: integer('max_touch_points'),
  latitude: doublePrecision('latitude'),
  longitude: doublePrecision('longitude'),
  locationLabel: text('location_label'),
  country: text('country'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, table => [
  index('access_events_created_idx').on(table.createdAt),
  index('access_events_type_idx').on(table.eventType),
  index('access_events_ip_idx').on(table.ipAddress),
  index('access_events_device_id_idx').on(table.deviceId),
])
