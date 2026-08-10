ALTER TABLE "ai_provider_settings"
  ADD COLUMN IF NOT EXISTS "ai_administrator_review_wait_minutes" integer DEFAULT 5 NOT NULL;
