ALTER TABLE "estimates" ADD COLUMN IF NOT EXISTS "creation_source" text DEFAULT 'blank' NOT NULL;
--> statement-breakpoint
ALTER TABLE "estimates" ADD COLUMN IF NOT EXISTS "approved_by" uuid;
--> statement-breakpoint
ALTER TABLE "estimates" ADD COLUMN IF NOT EXISTS "approved_at" timestamp with time zone;
--> statement-breakpoint
ALTER TABLE "estimates" ADD CONSTRAINT "estimates_approved_by_users_id_fk" FOREIGN KEY ("approved_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
