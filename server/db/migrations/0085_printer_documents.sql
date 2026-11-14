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
