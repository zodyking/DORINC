ALTER TABLE "service_logs"
  ADD COLUMN IF NOT EXISTS "due_date" date;
