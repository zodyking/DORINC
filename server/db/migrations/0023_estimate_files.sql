ALTER TABLE "estimates" ADD COLUMN IF NOT EXISTS "creation_source" text DEFAULT 'blank' NOT NULL;
--> statement-breakpoint
ALTER TABLE "estimates" ADD COLUMN IF NOT EXISTS "approved_by" uuid;
--> statement-breakpoint
ALTER TABLE "estimates" ADD COLUMN IF NOT EXISTS "approved_at" timestamp with time zone;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "estimates" ADD CONSTRAINT "estimates_approved_by_users_id_fk" FOREIGN KEY ("approved_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "estimate_files" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"estimate_id" uuid NOT NULL,
	"file_id" uuid NOT NULL,
	"template_version_id" uuid NOT NULL,
	"sha256_hash" text NOT NULL,
	"pdf_render_job_id" uuid,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "estimate_files_estimate_unique" UNIQUE("estimate_id")
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "estimate_files" ADD CONSTRAINT "estimate_files_estimate_id_estimates_id_fk" FOREIGN KEY ("estimate_id") REFERENCES "public"."estimates"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "estimate_files" ADD CONSTRAINT "estimate_files_file_id_app_files_id_fk" FOREIGN KEY ("file_id") REFERENCES "public"."app_files"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "estimate_files" ADD CONSTRAINT "estimate_files_template_version_id_invoice_template_versions_id_fk" FOREIGN KEY ("template_version_id") REFERENCES "public"."invoice_template_versions"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "estimate_files" ADD CONSTRAINT "estimate_files_pdf_render_job_id_pdf_render_jobs_id_fk" FOREIGN KEY ("pdf_render_job_id") REFERENCES "public"."pdf_render_jobs"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "estimate_files" ADD CONSTRAINT "estimate_files_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "estimate_files_file_idx" ON "estimate_files" USING btree ("file_id");
