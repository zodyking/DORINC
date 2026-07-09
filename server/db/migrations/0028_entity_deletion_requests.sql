CREATE TABLE IF NOT EXISTS "entity_deletion_requests" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "entity_type" text NOT NULL,
  "entity_id" uuid NOT NULL,
  "status" text DEFAULT 'pending' NOT NULL,
  "reason" text NOT NULL,
  "entity_label" text NOT NULL,
  "submitted_by" uuid NOT NULL,
  "reviewed_by" uuid,
  "reviewed_at" timestamp with time zone,
  "review_reason" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "entity_deletion_requests" ADD CONSTRAINT "entity_deletion_requests_submitted_by_users_id_fk" FOREIGN KEY ("submitted_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "entity_deletion_requests" ADD CONSTRAINT "entity_deletion_requests_reviewed_by_users_id_fk" FOREIGN KEY ("reviewed_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "entity_deletion_requests_status_idx" ON "entity_deletion_requests" USING btree ("status");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "entity_deletion_requests_entity_idx" ON "entity_deletion_requests" USING btree ("entity_type","entity_id");
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "entity_deletion_requests_pending_uq" ON "entity_deletion_requests" USING btree ("entity_type","entity_id") WHERE status = 'pending';
