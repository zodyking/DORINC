-- Persist the PDF emailed to PrintMe so the Staples page can preview it.
-- entity_id links invoice (or other) prints back to their source record.
ALTER TABLE "staples_print_jobs" ADD COLUMN IF NOT EXISTS "pdf_data" bytea;
ALTER TABLE "staples_print_jobs" ADD COLUMN IF NOT EXISTS "pdf_filename" text;
ALTER TABLE "staples_print_jobs" ADD COLUMN IF NOT EXISTS "entity_id" uuid;
ALTER TABLE "staples_print_jobs" ADD COLUMN IF NOT EXISTS "document_label" text;
CREATE INDEX IF NOT EXISTS "staples_print_jobs_entity_idx"
  ON "staples_print_jobs" USING btree ("document_type", "entity_id");
CREATE INDEX IF NOT EXISTS "staples_print_jobs_document_type_idx"
  ON "staples_print_jobs" USING btree ("document_type");
