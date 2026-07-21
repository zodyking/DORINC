// Idempotent creation of the access_events table used by the access-gate map.
// Runs on boot (after Drizzle migrate) so the feature works without depending
// on the journaled migration sequence.

const ACCESS_EVENTS_SQL = `
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

CREATE INDEX IF NOT EXISTS "access_events_created_idx" ON "access_events" USING btree ("created_at");
CREATE INDEX IF NOT EXISTS "access_events_type_idx" ON "access_events" USING btree ("event_type");
CREATE INDEX IF NOT EXISTS "access_events_ip_idx" ON "access_events" USING btree ("ip_address");
`.trim()

/**
 * Create the access_events table when missing. Safe to run on every boot.
 *
 * @param {import('pg').Pool} pool
 * @returns {Promise<boolean>} true when the table was created
 */
export async function ensureAccessGateSchema(pool) {
  const { rows } = await pool.query(`SELECT to_regclass('public.access_events') AS reg`)
  if (rows[0]?.reg) return false
  await pool.query(ACCESS_EVENTS_SQL)
  console.log('[migrate] ensured access-gate table (access_events)')
  return true
}
