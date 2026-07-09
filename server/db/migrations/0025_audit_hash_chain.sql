ALTER TABLE "audit_logs" ADD COLUMN IF NOT EXISTS "previous_hash" text;
--> statement-breakpoint
ALTER TABLE "audit_logs" ADD COLUMN IF NOT EXISTS "entry_hash" text;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "audit_logs_entry_hash_idx" ON "audit_logs" USING btree ("entry_hash");
