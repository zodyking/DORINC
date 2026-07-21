import { z } from 'zod'

/** Enforcement modes for the access gate. Default keeps everything permissive. */
export const ACCESS_GATE_BLOCK_MODES = ['off', 'ip', 'geo', 'both'] as const
export type AccessGateBlockMode = (typeof ACCESS_GATE_BLOCK_MODES)[number]

export const geoPointSchema = z.object({
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
})

/**
 * Access-gate configuration. Every field defaults to the safe, disabled state
 * so the feature is completely inert until an admin turns it on.
 */
export const accessGateSettingsSchema = z.object({
  /** Master switch. When false the gate captures nothing and blocks nothing. */
  enabled: z.boolean().default(false),
  /** Enforcement mode applied only while `enabled` is true. */
  blockMode: z.enum(ACCESS_GATE_BLOCK_MODES).default('off'),
  /** Where blocked visitors/logins are redirected. Empty → plain 403. */
  redirectUrl: z.string().trim().max(2000).default(''),
  /** Exact IP addresses that are always blocked (when blockMode includes IP). */
  bannedIps: z.array(z.string().trim().min(1).max(64)).max(1000).default([]),
  /** Allowed-area polygon for the geofence (when blockMode includes geo). */
  allowedPolygon: z.array(geoPointSchema).max(2000).default([]),
})

export type AccessGateSettings = z.infer<typeof accessGateSettingsSchema>

export const DEFAULT_ACCESS_GATE_SETTINGS: AccessGateSettings = {
  enabled: false,
  blockMode: 'off',
  redirectUrl: '',
  bannedIps: [],
  allowedPolygon: [],
}
