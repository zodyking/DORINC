CREATE TABLE "invoice_template_versions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"template_id" uuid NOT NULL,
	"version_number" integer NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"html_content" text NOT NULL,
	"design_settings" jsonb NOT NULL,
	"published_at" timestamp with time zone,
	"published_by" uuid,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "invoice_templates" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"slug" text NOT NULL,
	"is_default" boolean DEFAULT false NOT NULL,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"archived_at" timestamp with time zone,
	CONSTRAINT "invoice_templates_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "pdf_render_jobs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"entity_type" text NOT NULL,
	"entity_id" uuid NOT NULL,
	"template_version_id" uuid,
	"html_content" text NOT NULL,
	"original_filename" text NOT NULL,
	"output_file_id" uuid,
	"status" text DEFAULT 'queued' NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"max_attempts" integer DEFAULT 3 NOT NULL,
	"last_error" text,
	"run_after" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"started_at" timestamp with time zone,
	"finished_at" timestamp with time zone,
	"created_by" uuid
);
--> statement-breakpoint
ALTER TABLE "invoice_template_versions" ADD CONSTRAINT "invoice_template_versions_template_id_invoice_templates_id_fk" FOREIGN KEY ("template_id") REFERENCES "public"."invoice_templates"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoice_template_versions" ADD CONSTRAINT "invoice_template_versions_published_by_users_id_fk" FOREIGN KEY ("published_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoice_template_versions" ADD CONSTRAINT "invoice_template_versions_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoice_templates" ADD CONSTRAINT "invoice_templates_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pdf_render_jobs" ADD CONSTRAINT "pdf_render_jobs_template_version_id_invoice_template_versions_id_fk" FOREIGN KEY ("template_version_id") REFERENCES "public"."invoice_template_versions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pdf_render_jobs" ADD CONSTRAINT "pdf_render_jobs_output_file_id_app_files_id_fk" FOREIGN KEY ("output_file_id") REFERENCES "public"."app_files"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pdf_render_jobs" ADD CONSTRAINT "pdf_render_jobs_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "invoice_template_versions_template_version_idx" ON "invoice_template_versions" USING btree ("template_id","version_number");--> statement-breakpoint
CREATE INDEX "invoice_template_versions_template_idx" ON "invoice_template_versions" USING btree ("template_id");--> statement-breakpoint
CREATE INDEX "invoice_template_versions_status_idx" ON "invoice_template_versions" USING btree ("status");--> statement-breakpoint
CREATE INDEX "invoice_templates_default_idx" ON "invoice_templates" USING btree ("is_default");--> statement-breakpoint
CREATE INDEX "pdf_render_jobs_poll_idx" ON "pdf_render_jobs" USING btree ("status","run_after");--> statement-breakpoint
CREATE INDEX "pdf_render_jobs_entity_idx" ON "pdf_render_jobs" USING btree ("entity_type","entity_id");