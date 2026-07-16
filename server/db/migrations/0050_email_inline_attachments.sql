ALTER TABLE "app_files" ADD COLUMN IF NOT EXISTS "content_id" text;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "app_files_message_content_id_idx" ON "app_files" USING btree ("owner_entity_id", "content_id") WHERE "content_id" IS NOT NULL;
