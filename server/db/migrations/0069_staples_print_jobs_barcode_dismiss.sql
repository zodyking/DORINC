-- Persist PrintMe barcode image + allow soft-dismiss until user removes the active order.
ALTER TABLE "staples_print_jobs"
  ADD COLUMN IF NOT EXISTS "barcode_image" bytea;
ALTER TABLE "staples_print_jobs"
  ADD COLUMN IF NOT EXISTS "barcode_content_type" text;
ALTER TABLE "staples_print_jobs"
  ADD COLUMN IF NOT EXISTS "dismissed_at" timestamp with time zone;

CREATE INDEX IF NOT EXISTS "staples_print_jobs_dismissed_idx"
  ON "staples_print_jobs" USING btree ("dismissed_at");
