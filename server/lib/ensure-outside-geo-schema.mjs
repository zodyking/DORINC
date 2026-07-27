// Idempotent creation of outside_geo_challenges for suspicious-location verification.
// Runs on boot (after Drizzle migrate) so the feature works without a journaled migration.

const OUTSIDE_GEO_CHALLENGES_SQL = `
CREATE TABLE IF NOT EXISTS "outside_geo_challenges" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "user_id" uuid NOT NULL,
  "user_name" text NOT NULL,
  "user_email" text NOT NULL,
  "code_hash" text NOT NULL,
  "ip_address" inet,
  "user_agent" text,
  "location_label" text,
  "expires_at" timestamp with time zone NOT NULL,
  "used_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS "outside_geo_challenges_user_idx" ON "outside_geo_challenges" USING btree ("user_id");
CREATE INDEX IF NOT EXISTS "outside_geo_challenges_expires_idx" ON "outside_geo_challenges" USING btree ("expires_at");
CREATE INDEX IF NOT EXISTS "outside_geo_challenges_ip_idx" ON "outside_geo_challenges" USING btree ("ip_address");
`.trim()

/**
 * Create the outside_geo_challenges table when missing. Safe to run on every boot.
 *
 * @param {import('pg').Pool} pool
 * @returns {Promise<boolean>} true when the table was created
 */
export async function ensureOutsideGeoSchema(pool) {
  const { rows } = await pool.query(`SELECT to_regclass('public.outside_geo_challenges') AS reg`)
  if (rows[0]?.reg) return false
  await pool.query(OUTSIDE_GEO_CHALLENGES_SQL)
  console.log('[migrate] ensured outside-geo table (outside_geo_challenges)')
  return true
}
