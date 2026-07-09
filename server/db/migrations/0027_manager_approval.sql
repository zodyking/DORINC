ALTER TABLE "invoices" ADD COLUMN IF NOT EXISTS "submitted_for_approval_at" timestamp with time zone;
--> statement-breakpoint
ALTER TABLE "invoices" ADD COLUMN IF NOT EXISTS "submitted_for_approval_by" uuid;
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "invoices" ADD CONSTRAINT "invoices_submitted_for_approval_by_users_id_fk"
    FOREIGN KEY ("submitted_for_approval_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
