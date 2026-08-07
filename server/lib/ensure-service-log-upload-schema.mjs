const SERVICE_LOG_UPLOAD_SESSIONS_SQL = `
CREATE TABLE IF NOT EXISTS "service_log_upload_sessions" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "token_hash" text NOT NULL,
  "created_by" uuid NOT NULL,
  "technician_id" uuid NOT NULL,
  "customer_id" uuid NOT NULL,
  "vehicle_id" uuid NOT NULL,
  "invoice_id" uuid,
  "service_log_id" uuid,
  "status" text DEFAULT 'pending' NOT NULL,
  "expires_at" timestamp with time zone NOT NULL,
  "completed_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS "service_log_upload_sessions_token_uq"
  ON "service_log_upload_sessions" USING btree ("token_hash");
CREATE INDEX IF NOT EXISTS "service_log_upload_sessions_status_idx"
  ON "service_log_upload_sessions" USING btree ("status");
CREATE INDEX IF NOT EXISTS "service_log_upload_sessions_expires_idx"
  ON "service_log_upload_sessions" USING btree ("expires_at");
CREATE INDEX IF NOT EXISTS "service_log_upload_sessions_invoice_idx"
  ON "service_log_upload_sessions" USING btree ("invoice_id");
`.trim()

/**
 * @param {import('pg').Pool} pool
 * @returns {Promise<boolean>} true when the table was created
 */
export async function ensureServiceLogUploadSchema(pool) {
  const { rows } = await pool.query(`SELECT to_regclass('public.service_log_upload_sessions') AS reg`)
  if (rows[0]?.reg) return false
  await pool.query(SERVICE_LOG_UPLOAD_SESSIONS_SQL)
  console.log('[migrate] ensured service_log_upload_sessions')
  return true
}
