ALTER TABLE "conversations"
  ADD COLUMN IF NOT EXISTS "title" text,
  ADD COLUMN IF NOT EXISTS "is_system" boolean DEFAULT false NOT NULL;

ALTER TABLE "users"
  ADD COLUMN IF NOT EXISTS "team_chat_enabled" boolean DEFAULT true NOT NULL,
  ADD COLUMN IF NOT EXISTS "message_email_notify" boolean DEFAULT true NOT NULL;

CREATE INDEX IF NOT EXISTS "conversations_system_idx"
  ON "conversations" USING btree ("is_system")
  WHERE "is_system" = true;
