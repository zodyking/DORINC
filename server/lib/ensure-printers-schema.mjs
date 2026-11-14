const PRINTERS_SQL = `
CREATE TABLE IF NOT EXISTS "printers" (
  "queue" text PRIMARY KEY NOT NULL,
  "label" text NOT NULL,
  "host" text NOT NULL,
  "protocol" text DEFAULT 'socket' NOT NULL,
  "identity" text DEFAULT '' NOT NULL,
  "driver" text DEFAULT '' NOT NULL,
  "tail_hostname" text DEFAULT '' NOT NULL,
  "tail_ip" text DEFAULT '' NOT NULL,
  "image_mode" text DEFAULT 'auto' NOT NULL,
  "image_key" text DEFAULT '' NOT NULL,
  "image_source" text DEFAULT '' NOT NULL,
  "image_path" text DEFAULT '' NOT NULL,
  "image_license" text DEFAULT '' NOT NULL,
  "image_attribution" text DEFAULT '' NOT NULL,
  "image_page" text DEFAULT '' NOT NULL,
  "image_fingerprint" text DEFAULT '' NOT NULL,
  "image_candidates" text DEFAULT '' NOT NULL,
  "image_data" bytea,
  "image_content_type" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
CREATE INDEX IF NOT EXISTS "printers_host_idx" ON "printers" USING btree ("host");

CREATE TABLE IF NOT EXISTS "printer_jobs" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "dedupe" text,
  "source" text NOT NULL,
  "sender" text DEFAULT '' NOT NULL,
  "filename" text NOT NULL,
  "queue" text NOT NULL,
  "pages" integer,
  "copies" integer DEFAULT 1 NOT NULL,
  "sides" text DEFAULT 'one-sided' NOT NULL,
  "status" text NOT NULL,
  "cups_id" text DEFAULT '' NOT NULL,
  "filepath" text DEFAULT '' NOT NULL,
  "file_data" bytea,
  "error" text DEFAULT '' NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS "printer_jobs_dedupe_uq" ON "printer_jobs" USING btree ("dedupe");
CREATE INDEX IF NOT EXISTS "printer_jobs_status_idx" ON "printer_jobs" USING btree ("status");
CREATE INDEX IF NOT EXISTS "printer_jobs_queue_idx" ON "printer_jobs" USING btree ("queue");
CREATE INDEX IF NOT EXISTS "printer_jobs_created_idx" ON "printer_jobs" USING btree ("created_at");

CREATE TABLE IF NOT EXISTS "printer_events" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "level" text DEFAULT 'info' NOT NULL,
  "message" text NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
CREATE INDEX IF NOT EXISTS "printer_events_created_idx" ON "printer_events" USING btree ("created_at");

CREATE TABLE IF NOT EXISTS "printer_settings" (
  "key" text PRIMARY KEY NOT NULL,
  "value" text DEFAULT '' NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS "printer_mail_batches" (
  "prefix" text PRIMARY KEY NOT NULL,
  "sender" text DEFAULT '' NOT NULL,
  "subject" text DEFAULT '' NOT NULL,
  "message_id" text DEFAULT '' NOT NULL,
  "queue" text DEFAULT '' NOT NULL,
  "phase" text DEFAULT 'new' NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS "printer_image_catalog" (
  "model_key" text PRIMARY KEY NOT NULL,
  "manufacturer" text DEFAULT '' NOT NULL,
  "model" text DEFAULT '' NOT NULL,
  "source" text DEFAULT '' NOT NULL,
  "fingerprint_id" text DEFAULT '' NOT NULL,
  "local_path" text DEFAULT '' NOT NULL,
  "confidence" real DEFAULT 0 NOT NULL,
  "license" text DEFAULT '' NOT NULL,
  "attribution" text DEFAULT '' NOT NULL,
  "source_page" text DEFAULT '' NOT NULL,
  "checked_at" timestamp with time zone,
  "negative_until" timestamp with time zone,
  "category" text DEFAULT 'generic' NOT NULL,
  "candidates" text DEFAULT '' NOT NULL
);
`.trim()

const PRINTER_DOCUMENTS_SQL = `
ALTER TABLE "printer_jobs" ADD COLUMN IF NOT EXISTS "document_id" uuid;
CREATE INDEX IF NOT EXISTS "printer_jobs_document_idx" ON "printer_jobs" USING btree ("document_id");
CREATE TABLE IF NOT EXISTS "printer_documents" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "filename" text NOT NULL,
  "file_type" text NOT NULL,
  "pages" integer,
  "bytes" integer DEFAULT 0 NOT NULL,
  "data" bytea NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS "printer_documents_name_type_uq" ON "printer_documents" USING btree ("filename","file_type");
`.trim()

/**
 * @param {import('pg').Pool} pool
 * @returns {Promise<boolean>}
 */
export async function ensurePrintersSchema(pool) {
  const { rows } = await pool.query(`SELECT to_regclass('public.printers') AS reg`)
  let created = false
  if (!rows[0]?.reg) {
    await pool.query(PRINTERS_SQL)
    console.log('[migrate] ensured printers schema')
    created = true
  }
  else {
    await pool.query(`ALTER TABLE "printers" ADD COLUMN IF NOT EXISTS "image_data" bytea`)
    await pool.query(`ALTER TABLE "printers" ADD COLUMN IF NOT EXISTS "image_content_type" text`)
    await pool.query(`ALTER TABLE "printer_jobs" ADD COLUMN IF NOT EXISTS "file_data" bytea`)
  }
  await pool.query(PRINTER_DOCUMENTS_SQL)
  return created
}
