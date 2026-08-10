/** Idempotent Quo/SMS columns + sms_templates (boot safety alongside migration 0072). */

const SQL = `
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "phone" text;
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "message_notify_channel" text DEFAULT 'email' NOT NULL;

CREATE TABLE IF NOT EXISTS "sms_templates" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "type_key" text NOT NULL UNIQUE,
  "name" text NOT NULL,
  "is_active" boolean DEFAULT false NOT NULL,
  "content" jsonb NOT NULL,
  "updated_by" uuid,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS "sms_templates_active_idx" ON "sms_templates" USING btree ("is_active");
`.trim()

/**
 * @param {import('pg').Pool} pool
 */
export async function ensureQuoSchema(pool) {
  await pool.query(SQL)
}
