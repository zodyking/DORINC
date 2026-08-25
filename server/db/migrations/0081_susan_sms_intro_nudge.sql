ALTER TABLE "susan_sms_threads" ADD COLUMN IF NOT EXISTS "last_intro_at" timestamp with time zone;
ALTER TABLE "susan_sms_threads" ADD COLUMN IF NOT EXISTS "opted_out_at" timestamp with time zone;

CREATE INDEX IF NOT EXISTS "susan_sms_threads_intro_idx"
  ON "susan_sms_threads" ("last_intro_at");
