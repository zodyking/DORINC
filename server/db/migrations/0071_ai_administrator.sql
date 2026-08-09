ALTER TABLE "ai_provider_settings" ADD COLUMN IF NOT EXISTS "ai_administrator_model" text;
--> statement-breakpoint
ALTER TABLE "ai_provider_settings" ADD COLUMN IF NOT EXISTS "ai_administrator_enabled" boolean DEFAULT true NOT NULL;
