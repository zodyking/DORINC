// Idempotent creation of the security access-control tables (ip_bans,
// geofences, access_events). Runs on boot after Drizzle migrate so the feature
// works without depending on the journaled migration sequence, and so existing
// installs pick up new columns without a manual migration step.

const CREATE_SQL = `
CREATE TABLE IF NOT EXISTS "access_events" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "event_type" text NOT NULL,
  "outcome" text DEFAULT 'allowed' NOT NULL,
  "ip_address" inet,
  "user_id" uuid,
  "user_name" text,
  "user_email" text,
  "path" text,
  "user_agent" text,
  "latitude" double precision,
  "longitude" double precision,
  "location_label" text,
  "country" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS "ip_bans" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "ip_rule" text NOT NULL UNIQUE,
  "ip_address" inet,
  "kind" text DEFAULT 'single' NOT NULL,
  "family" integer DEFAULT 4 NOT NULL,
  "reason" text DEFAULT '' NOT NULL,
  "notes" text DEFAULT '' NOT NULL,
  "source" text DEFAULT 'manual' NOT NULL,
  "status" text DEFAULT 'active' NOT NULL,
  "expires_at" timestamp with time zone,
  "created_by" uuid,
  "created_by_name" text,
  "created_by_email" text,
  "lifted_at" timestamp with time zone,
  "lifted_by" uuid,
  "lifted_by_name" text,
  "lift_reason" text,
  "hit_count" integer DEFAULT 0 NOT NULL,
  "last_hit_at" timestamp with time zone,
  "trigger_attempts" integer DEFAULT 0 NOT NULL,
  "last_location_label" text,
  "last_country" text,
  "last_latitude" double precision,
  "last_longitude" double precision,
  "last_user_agent" text,
  "last_identifiers" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS "geofences" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "name" text NOT NULL,
  "description" text DEFAULT '' NOT NULL,
  "kind" text DEFAULT 'allow' NOT NULL,
  "enabled" boolean DEFAULT true NOT NULL,
  "color" text DEFAULT '#4f46e5' NOT NULL,
  "polygon" jsonb NOT NULL,
  "min_lat" double precision,
  "max_lat" double precision,
  "min_lng" double precision,
  "max_lng" double precision,
  "created_by" uuid,
  "created_by_name" text,
  "hit_count" integer DEFAULT 0 NOT NULL,
  "last_hit_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
`.trim()

/** Columns added to access_events after the original access-gate release. */
const ACCESS_EVENT_COLUMNS = [
  ['stage', `text DEFAULT 'page_load' NOT NULL`],
  ['block_reason', 'text'],
  ['enforced', 'boolean DEFAULT false NOT NULL'],
  ['matched_ip_rule', 'text'],
  ['matched_ban_id', 'uuid'],
  ['matched_geofence_id', 'uuid'],
  ['matched_geofence_name', 'text'],
  ['session_id', 'uuid'],
  ['request_id', 'text'],
  ['geo_source', `text DEFAULT 'none' NOT NULL`],
  ['accuracy_m', 'double precision'],
  ['ip_latitude', 'double precision'],
  ['ip_longitude', 'double precision'],
  ['device_latitude', 'double precision'],
  ['device_longitude', 'double precision'],
  ['city', 'text'],
  ['region', 'text'],
  ['postal_code', 'text'],
  ['timezone', 'text'],
  ['attempted_identifier', 'text'],
  ['attempted_portal', 'text'],
  ['password_fingerprint', 'text'],
  ['password_length', 'integer'],
  ['account_exists', 'boolean'],
  ['failure_reason', 'text'],
]

const INDEX_SQL = `
CREATE INDEX IF NOT EXISTS "access_events_created_idx" ON "access_events" USING btree ("created_at");
CREATE INDEX IF NOT EXISTS "access_events_type_idx" ON "access_events" USING btree ("event_type");
CREATE INDEX IF NOT EXISTS "access_events_ip_idx" ON "access_events" USING btree ("ip_address");
CREATE INDEX IF NOT EXISTS "access_events_outcome_idx" ON "access_events" USING btree ("outcome");
CREATE INDEX IF NOT EXISTS "access_events_identifier_idx" ON "access_events" USING btree ("attempted_identifier");
CREATE INDEX IF NOT EXISTS "ip_bans_status_idx" ON "ip_bans" USING btree ("status");
CREATE INDEX IF NOT EXISTS "ip_bans_created_idx" ON "ip_bans" USING btree ("created_at");
CREATE INDEX IF NOT EXISTS "geofences_enabled_idx" ON "geofences" USING btree ("enabled");
`.trim()

const LEGACY_SETTINGS_KEY = 'security.access_gate'

/**
 * Move the pre-rebuild `security.access_gate` JSON blob (a flat banned-IP list
 * plus one unnamed polygon) into the ip_bans and geofences tables. Runs once:
 * the legacy row is renamed afterwards so a later boot skips it.
 *
 * @param {import('pg').Pool} pool
 */
async function migrateLegacyAccessGate(pool) {
  const { rows } = await pool.query(
    `SELECT value FROM app_settings WHERE key = $1 LIMIT 1`,
    [LEGACY_SETTINGS_KEY],
  )
  const legacy = rows[0]?.value
  if (!legacy || typeof legacy !== 'object') return

  const bannedIps = Array.isArray(legacy.bannedIps) ? legacy.bannedIps : []
  const polygon = Array.isArray(legacy.allowedPolygon) ? legacy.allowedPolygon : []
  let imported = 0

  for (const raw of bannedIps) {
    const rule = typeof raw === 'string' ? raw.trim().toLowerCase() : ''
    // The legacy list only ever held single normalized addresses.
    if (!rule || !/^[0-9a-f.:]+$/.test(rule)) continue
    const isRange = rule.includes('/')
    const { rowCount } = await pool.query(
      `INSERT INTO ip_bans (ip_rule, ip_address, kind, family, reason, source, status)
       VALUES ($1, $2, $3, $4, $5, 'manual', 'active')
       ON CONFLICT (ip_rule) DO NOTHING`,
      [
        rule,
        isRange ? null : rule,
        isRange ? 'range' : 'single',
        rule.includes(':') ? 6 : 4,
        'Imported from the previous access gate',
      ],
    )
    imported += rowCount ?? 0
  }

  const validPolygon = polygon.filter(p => (
    p && typeof p.lat === 'number' && typeof p.lng === 'number'
  ))
  if (validPolygon.length >= 3) {
    const lats = validPolygon.map(p => p.lat)
    const lngs = validPolygon.map(p => p.lng)
    await pool.query(
      `INSERT INTO geofences (name, description, kind, enabled, polygon, min_lat, max_lat, min_lng, max_lng)
       SELECT $1, $2, 'allow', true, $3::jsonb, $4, $5, $6, $7
       WHERE NOT EXISTS (SELECT 1 FROM geofences WHERE name = $1)`,
      [
        'Imported allowed area',
        'Migrated from the previous access gate polygon',
        JSON.stringify(validPolygon),
        Math.min(...lats),
        Math.max(...lats),
        Math.min(...lngs),
        Math.max(...lngs),
      ],
    )
  }

  await pool.query(
    `UPDATE app_settings SET key = $2, updated_at = now() WHERE key = $1`,
    [LEGACY_SETTINGS_KEY, `${LEGACY_SETTINGS_KEY}.migrated`],
  )
  console.log(`[migrate] migrated legacy access gate (${imported} ban(s), ${validPolygon.length >= 3 ? 1 : 0} zone(s))`)
}

/**
 * Create/extend the security tables. Safe to run on every boot.
 *
 * @param {import('pg').Pool} pool
 */
export async function ensureSecuritySchema(pool) {
  await pool.query(CREATE_SQL)

  for (const [name, definition] of ACCESS_EVENT_COLUMNS) {
    await pool.query(`ALTER TABLE "access_events" ADD COLUMN IF NOT EXISTS "${name}" ${definition}`)
  }

  await pool.query(INDEX_SQL)

  try {
    await migrateLegacyAccessGate(pool)
  }
  catch (err) {
    console.warn(`[migrate] legacy access-gate migration skipped: ${err.message}`)
  }
}
