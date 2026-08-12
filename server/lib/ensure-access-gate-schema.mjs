// Idempotent creation of the access_events table used by the access-gate map.
// Runs on boot (after Drizzle migrate) so the feature works without depending
// on the journaled migration sequence.

const ACCESS_EVENTS_SQL = `
CREATE TABLE IF NOT EXISTS "access_events" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "event_type" text NOT NULL,
  "outcome" text DEFAULT 'allowed' NOT NULL,
  "block_reason" text,
  "ip_address" inet,
  "user_id" uuid,
  "user_name" text,
  "user_email" text,
  "path" text,
  "user_agent" text,
  "device_id" text,
  "os" text,
  "device_type" text,
  "screen_resolution" text,
  "device_pixel_ratio" double precision,
  "cpu_cores" integer,
  "device_memory_gb" double precision,
  "gpu_renderer" text,
  "canvas_fingerprint" text,
  "webgl_fingerprint" text,
  "audio_fingerprint" text,
  "timezone" text,
  "language" text,
  "max_touch_points" integer,
  "latitude" double precision,
  "longitude" double precision,
  "location_label" text,
  "country" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS "access_events_created_idx" ON "access_events" USING btree ("created_at");
CREATE INDEX IF NOT EXISTS "access_events_type_idx" ON "access_events" USING btree ("event_type");
CREATE INDEX IF NOT EXISTS "access_events_ip_idx" ON "access_events" USING btree ("ip_address");
CREATE INDEX IF NOT EXISTS "access_events_device_id_idx" ON "access_events" USING btree ("device_id");
CREATE INDEX IF NOT EXISTS "access_events_block_reason_idx" ON "access_events" USING btree ("block_reason");
`.trim()

const ACCESS_EVENTS_DEVICE_COLUMNS_SQL = `
ALTER TABLE "access_events" ADD COLUMN IF NOT EXISTS "device_id" text;
ALTER TABLE "access_events" ADD COLUMN IF NOT EXISTS "os" text;
ALTER TABLE "access_events" ADD COLUMN IF NOT EXISTS "device_type" text;
ALTER TABLE "access_events" ADD COLUMN IF NOT EXISTS "screen_resolution" text;
ALTER TABLE "access_events" ADD COLUMN IF NOT EXISTS "device_pixel_ratio" double precision;
ALTER TABLE "access_events" ADD COLUMN IF NOT EXISTS "cpu_cores" integer;
ALTER TABLE "access_events" ADD COLUMN IF NOT EXISTS "device_memory_gb" double precision;
ALTER TABLE "access_events" ADD COLUMN IF NOT EXISTS "gpu_renderer" text;
ALTER TABLE "access_events" ADD COLUMN IF NOT EXISTS "canvas_fingerprint" text;
ALTER TABLE "access_events" ADD COLUMN IF NOT EXISTS "webgl_fingerprint" text;
ALTER TABLE "access_events" ADD COLUMN IF NOT EXISTS "audio_fingerprint" text;
ALTER TABLE "access_events" ADD COLUMN IF NOT EXISTS "timezone" text;
ALTER TABLE "access_events" ADD COLUMN IF NOT EXISTS "language" text;
ALTER TABLE "access_events" ADD COLUMN IF NOT EXISTS "max_touch_points" integer;
ALTER TABLE "access_events" ADD COLUMN IF NOT EXISTS "block_reason" text;
CREATE INDEX IF NOT EXISTS "access_events_device_id_idx" ON "access_events" USING btree ("device_id");
CREATE INDEX IF NOT EXISTS "access_events_block_reason_idx" ON "access_events" USING btree ("block_reason");
`.trim()

/**
 * Create the access_events table when missing. Safe to run on every boot.
 *
 * @param {import('pg').Pool} pool
 * @returns {Promise<boolean>} true when the table was created
 */
export async function ensureAccessGateSchema(pool) {
  const { rows } = await pool.query(`SELECT to_regclass('public.access_events') AS reg`)
  if (!rows[0]?.reg) {
    await pool.query(ACCESS_EVENTS_SQL)
    console.log('[migrate] ensured access-gate table (access_events)')
    return true
  }
  await pool.query(ACCESS_EVENTS_DEVICE_COLUMNS_SQL)
  return false
}
