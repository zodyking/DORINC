const STAPLES_PRINT_JOBS_SQL = `
CREATE TABLE IF NOT EXISTS "staples_print_jobs" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "created_by" uuid NOT NULL,
  "document_type" text DEFAULT 'service_log_sheet' NOT NULL,
  "status" text DEFAULT 'queued' NOT NULL,
  "subject_token" text NOT NULL,
  "outbound_message_id" text,
  "release_code" text,
  "reply_internet_message_id" text,
  "error_message" text,
  "emailed_at" timestamp with time zone,
  "ready_at" timestamp with time zone,
  "expires_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS "staples_print_jobs_token_uq"
  ON "staples_print_jobs" USING btree ("subject_token");
CREATE INDEX IF NOT EXISTS "staples_print_jobs_status_idx"
  ON "staples_print_jobs" USING btree ("status");
CREATE INDEX IF NOT EXISTS "staples_print_jobs_outbound_idx"
  ON "staples_print_jobs" USING btree ("outbound_message_id");
CREATE INDEX IF NOT EXISTS "staples_print_jobs_created_by_idx"
  ON "staples_print_jobs" USING btree ("created_by");
`.trim()

/**
 * @param {import('pg').Pool} pool
 * @returns {Promise<boolean>} true when the table was created
 */
export async function ensureStaplesPrintJobsSchema(pool) {
  const { rows } = await pool.query(`SELECT to_regclass('public.staples_print_jobs') AS reg`)
  if (rows[0]?.reg) return false
  await pool.query(STAPLES_PRINT_JOBS_SQL)
  console.log('[migrate] ensured staples_print_jobs')
  return true
}
