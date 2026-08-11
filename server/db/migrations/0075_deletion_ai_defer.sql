ALTER TABLE "entity_deletion_requests"
  ADD COLUMN IF NOT EXISTS "ai_reviewed_at" timestamp with time zone;
ALTER TABLE "entity_deletion_requests"
  ADD COLUMN IF NOT EXISTS "ai_review_note" text;
