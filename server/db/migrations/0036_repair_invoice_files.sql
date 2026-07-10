-- Repair: some production DBs have invoice_templates (0012) but never got invoice_files (0013).
CREATE TABLE IF NOT EXISTS "invoice_files" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"invoice_id" uuid NOT NULL,
	"file_id" uuid NOT NULL,
	"template_version_id" uuid,
	"sha256_hash" text NOT NULL,
	"pdf_render_job_id" uuid,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "invoice_files" ADD CONSTRAINT "invoice_files_invoice_id_invoices_id_fk" FOREIGN KEY ("invoice_id") REFERENCES "public"."invoices"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "invoice_files" ADD CONSTRAINT "invoice_files_file_id_app_files_id_fk" FOREIGN KEY ("file_id") REFERENCES "public"."app_files"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "invoice_files" ADD CONSTRAINT "invoice_files_template_version_id_invoice_template_versions_id_fk" FOREIGN KEY ("template_version_id") REFERENCES "public"."invoice_template_versions"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "invoice_files" ADD CONSTRAINT "invoice_files_pdf_render_job_id_pdf_render_jobs_id_fk" FOREIGN KEY ("pdf_render_job_id") REFERENCES "public"."pdf_render_jobs"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "invoice_files" ADD CONSTRAINT "invoice_files_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "invoice_files_invoice_unique" ON "invoice_files" USING btree ("invoice_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "invoice_files_file_idx" ON "invoice_files" USING btree ("file_id");
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "invoice_files" ALTER COLUMN "template_version_id" DROP NOT NULL;
EXCEPTION
  WHEN undefined_table THEN null;
  WHEN others THEN null;
END $$;
