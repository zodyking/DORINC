ALTER TABLE "susan_sms_threads" ADD COLUMN IF NOT EXISTS "last_user_at" timestamp with time zone;
ALTER TABLE "susan_sms_threads" ADD COLUMN IF NOT EXISTS "idle_closed_at" timestamp with time zone;

CREATE INDEX IF NOT EXISTS "susan_sms_threads_idle_idx"
  ON "susan_sms_threads" ("last_user_at")
  WHERE "idle_closed_at" IS NULL AND "last_user_at" IS NOT NULL;
