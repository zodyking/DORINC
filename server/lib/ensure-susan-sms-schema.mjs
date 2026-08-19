/**
 * Additive Susan SMS thread table for environments that may race Drizzle migrate.
 * @param {import('pg').Pool} pool
 */
export async function ensureSusanSmsSchema(pool) {
  await pool.query(`
CREATE TABLE IF NOT EXISTS "susan_sms_threads" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "user_id" uuid NOT NULL UNIQUE REFERENCES "users"("id") ON DELETE cascade,
  "phone" text NOT NULL,
  "messages" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "last_inbound_message_id" text,
  "pending_action" jsonb,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
CREATE INDEX IF NOT EXISTS "susan_sms_threads_phone_idx" ON "susan_sms_threads" USING btree ("phone");
`)
  await pool.query(`
ALTER TABLE "susan_sms_threads" ADD COLUMN IF NOT EXISTS "pending_action" jsonb;
`)
}
