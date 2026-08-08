const STAPLES_PRINT_JOBS_SQL = `
CREATE TABLE IF NOT EXISTS "staples_print_jobs" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "created_by" uuid NOT NULL,
  "document_type" text DEFAULT 'service_log_sheet' NOT NULL,
  "document_label" text,
  "entity_id" uuid,
  "status" text DEFAULT 'queued' NOT NULL,
  "subject_token" text NOT NULL,
  "outbound_message_id" text,
  "release_code" text,
  "reply_internet_message_id" text,
  "barcode_image" bytea,
  "barcode_content_type" text,
  "pdf_data" bytea,
  "pdf_filename" text,
  "error_message" text,
  "emailed_at" timestamp with time zone,
  "ready_at" timestamp with time zone,
  "expires_at" timestamp with time zone,
  "dismissed_at" timestamp with time zone,
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
CREATE INDEX IF NOT EXISTS "staples_print_jobs_dismissed_idx"
  ON "staples_print_jobs" USING btree ("dismissed_at");
`.trim()

const STAPLES_PRINT_JOBS_COLUMNS_SQL = `
ALTER TABLE "staples_print_jobs" ADD COLUMN IF NOT EXISTS "barcode_image" bytea;
ALTER TABLE "staples_print_jobs" ADD COLUMN IF NOT EXISTS "barcode_content_type" text;
ALTER TABLE "staples_print_jobs" ADD COLUMN IF NOT EXISTS "dismissed_at" timestamp with time zone;
ALTER TABLE "staples_print_jobs" ADD COLUMN IF NOT EXISTS "pdf_data" bytea;
ALTER TABLE "staples_print_jobs" ADD COLUMN IF NOT EXISTS "pdf_filename" text;
ALTER TABLE "staples_print_jobs" ADD COLUMN IF NOT EXISTS "entity_id" uuid;
ALTER TABLE "staples_print_jobs" ADD COLUMN IF NOT EXISTS "document_label" text;
CREATE INDEX IF NOT EXISTS "staples_print_jobs_dismissed_idx"
  ON "staples_print_jobs" USING btree ("dismissed_at");
CREATE INDEX IF NOT EXISTS "staples_print_jobs_entity_idx"
  ON "staples_print_jobs" USING btree ("document_type", "entity_id");
CREATE INDEX IF NOT EXISTS "staples_print_jobs_document_type_idx"
  ON "staples_print_jobs" USING btree ("document_type");
`.trim()

/**
 * @param {import('pg').Pool} pool
 * @returns {Promise<boolean>} true when the table was created
 */
export async function ensureStaplesPrintJobsSchema(pool) {
  const { rows } = await pool.query(`SELECT to_regclass('public.staples_print_jobs') AS reg`)
  let created = false
  if (!rows[0]?.reg) {
    await pool.query(STAPLES_PRINT_JOBS_SQL)
    console.log('[migrate] ensured staples_print_jobs')
    created = true
  }
  // Always apply additive columns — CREATE TABLE above may race older deploys.
  await pool.query(STAPLES_PRINT_JOBS_COLUMNS_SQL)
  return created
}
